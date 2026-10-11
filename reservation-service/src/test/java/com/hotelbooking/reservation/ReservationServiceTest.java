package com.hotelbooking.reservation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.money.Money;
import com.hotelbooking.common.privacy.FieldCipher;
import com.hotelbooking.common.resilience.DependencyUnavailableException;
import com.hotelbooking.common.web.ApiException;
import com.hotelbooking.common.web.FieldIssue;
import com.hotelbooking.reservation.ReservationApi.CartLine;
import com.hotelbooking.reservation.ReservationApi.CartRoom;
import com.hotelbooking.reservation.ReservationApi.CartSnapshot;
import com.hotelbooking.reservation.ReservationApi.CartTotals;
import com.hotelbooking.reservation.ReservationApi.Guest;
import com.hotelbooking.reservation.ReservationApi.InventoryStatus;
import com.hotelbooking.reservation.ReservationApi.MessageStatus;
import com.hotelbooking.reservation.ReservationApi.Outcome;
import com.hotelbooking.reservation.ReservationApi.PaymentStatus;
import com.hotelbooking.reservation.ReservationApi.ReservationRequest;
import com.hotelbooking.reservation.ReservationApi.Status;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;

/** Epic 6 (AQPI-18) reservation outcomes that need a failing dependency, plus Epic 7 privacy (AQPI-28). */
class ReservationServiceTest {

    private static final LocalDate CHECK_IN = LocalDate.of(2026, 11, 2);

    private Downstream downstream;
    private PaymentGateway gateway;
    private ReservationService service;

    @BeforeEach
    void setUp() {
        downstream = mock(Downstream.class);
        gateway = new PaymentGateway();
        service = service(Clock.systemUTC());
        when(downstream.checkout(anyString())).thenReturn(Mono.just(cart("PAY_NOW")));
        when(downstream.completeCart(anyString(), anyString())).thenReturn(Mono.empty());
        when(downstream.requestConfirmation(any())).thenReturn(Mono.just(new MessageStatus("M-1", "SENT")));
        when(downstream.release(anyString())).thenReturn(Mono.empty());
    }

    private ReservationService service(Clock clock) {
        EventPublisher events = new EventPublisher(new ObjectMapper().findAndRegisterModules(), new SimpleMeterRegistry(),
                clock, "test", "reservation-service");
        return new ReservationService(new GuestValidator(), gateway, downstream, new FieldCipher(null),
                new ReservationProperties(), events, clock);
    }

    @Test
    @DisplayName("AQPI-19 7.1: every invalid guest field is reported with its rule")
    void guestValidation() {
        ReservationRequest bad = new ReservationRequest("C-1",
                new Guest("", "Doe", "not-an-email", "12", "25:99", "card 4111 1111 1111 1111"), "tok_ok", false, false,
                "en");
        assertThatThrownBy(() -> service.submit("key-12345678", bad).block())
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(e.fieldIssues()).extracting(FieldIssue::field)
                            .contains("guest.firstName", "guest.email", "guest.phone", "guest.arrivalTime",
                                    "guest.specialRequests", "privacyNoticeAccepted");
                });
        assertThat(gateway.calls()).isZero();
    }

    @Test
    @DisplayName("AQPI-21 7.3: a room lost after authorisation voids the payment and reports the room as unavailable")
    void inventoryConflictVoidsPayment() {
        when(downstream.commit(any())).thenReturn(Mono.error(new ApiException(HttpStatus.CONFLICT, "SOLD_OUT", "gone")));
        Outcome outcome = service.submit("key-void-0001", request("tok_visa_ok")).block().outcome();
        assertThat(outcome.status()).isEqualTo(Status.FAILED);
        assertThat(outcome.paymentStatus()).isEqualTo(PaymentStatus.VOIDED);
        assertThat(service.reconciliation().get(0).consistent()).isTrue();
        verify(downstream, never()).requestConfirmation(any());
    }

    @Test
    @DisplayName("AQPI-21 7.3 AC4: a failed void after a lost room goes to manual review, never a silent charge")
    void failedVoidGoesToManualReview() {
        when(downstream.commit(any())).thenReturn(Mono.error(new ApiException(HttpStatus.CONFLICT, "SOLD_OUT", "gone")));
        Outcome outcome = service.submit("key-void-0002", request("tok_void_fails")).block().outcome();
        assertThat(outcome.status()).isEqualTo(Status.MANUAL_REVIEW);
        assertThat(outcome.doNotResubmit()).isTrue();
        assertThat(service.manualReview()).hasSize(1);
    }

    @Test
    @DisplayName("AQPI-21 AQPI-31: an inventory timeout is held for review and recovered by reconciliation")
    void inventoryTimeoutRecovered() {
        when(downstream.commit(any())).thenReturn(Mono.error(new DependencyUnavailableException("hotel-service",
                DependencyUnavailableException.Category.TIMEOUT, new RuntimeException("timeout"))));
        Outcome held = service.submit("key-inv-00001", request("tok_visa_ok")).block().outcome();
        assertThat(held.status()).isEqualTo(Status.MANUAL_REVIEW);
        assertThat(service.reconciliation().get(0).inventoryStatus()).isEqualTo(InventoryStatus.UNKNOWN);

        when(downstream.commit(any())).thenReturn(Mono.empty());
        Outcome recovered = service.reconcile(held.reservationId()).block();
        assertThat(recovered.status()).isEqualTo(Status.CONFIRMED);
        assertThat(gateway.calls()).isEqualTo(1);
    }

    @Test
    @DisplayName("AQPI-24 8.1 BR: an e-mail failure never undoes a confirmed booking")
    void notificationFailureKeepsBooking() {
        when(downstream.commit(any())).thenReturn(Mono.empty());
        when(downstream.requestConfirmation(any())).thenReturn(Mono.error(new RuntimeException("smtp down")));
        Outcome outcome = service.submit("key-mail-0001", request("tok_visa_ok")).block().outcome();
        assertThat(outcome.status()).isEqualTo(Status.CONFIRMED);
        assertThat(outcome.notificationStatus()).isEqualTo("FAILED_TO_REQUEST");
    }

    @Test
    @DisplayName("AQPI-20 7.2: pay-at-hotel only guarantees the card with a zero charge")
    void payAtHotelGuarantee() {
        when(downstream.checkout(anyString())).thenReturn(Mono.just(cart("PAY_AT_HOTEL")));
        when(downstream.commit(any())).thenReturn(Mono.empty());
        service.submit("key-guar-0001", request("tok_visa_ok")).block();
        assertThat(gateway.ledger().get(0).mode()).isEqualTo("GUARANTEE");
        assertThat(gateway.ledger().get(0).amount().amount()).isZero();
    }

    @Test
    @DisplayName("AQPI-28 9.1 AC3: support sees masked data, privacy officer sees full data, others are refused")
    void opsViewMasking() {
        when(downstream.commit(any())).thenReturn(Mono.empty());
        String id = service.submit("key-ops-00001", request("tok_visa_ok")).block().outcome().reservationId();
        assertThat(service.opsView(id, "SUPPORT").block().email()).isEqualTo("j***@e***.com");
        assertThat(service.opsView(id, "PRIVACY_OFFICER").block().email()).isEqualTo("jane.doe@example.com");
        assertThatThrownBy(() -> service.opsView(id, "MARKETING").block()).isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("AQPI-28 9.1 AC5: personal data is anonymised after the retention period")
    void retentionPurge() {
        when(downstream.commit(any())).thenReturn(Mono.empty());
        String id = service.submit("key-ret-00001", request("tok_visa_ok")).block().outcome().reservationId();
        ReservationService future = service;
        assertThat(future.purgeExpired()).isZero();
        Clock later = Clock.fixed(CHECK_IN.plusYears(2).atStartOfDay().toInstant(ZoneOffset.UTC), ZoneOffset.UTC);
        ReservationService aged = service(later);
        when(downstream.commit(any())).thenReturn(Mono.empty());
        aged.submit("key-ret-00002", request("tok_visa_ok")).block();
        assertThat(aged.purgeExpired()).isEqualTo(1);
        assertThat(aged.manualReview()).isEmpty();
        assertThat(id).startsWith("R-");
    }

    private static ReservationRequest request(String token) {
        return new ReservationRequest("C-1", new Guest("Jane", "Doe", "jane.doe@example.com", "+1 212 555 0100", "18:00",
                null), token, true, false, "en");
    }

    private static CartSnapshot cart(String paymentRule) {
        Money total = Money.of("500.00", "USD");
        CartRoom room = new CartRoom("H-NYC-001", "Harbor View Hotel", "New York", "12 Pier Street", "15:00", "11:00",
                "STD-K", "Standard King", "SAVER", "Advance saver", CHECK_IN, CHECK_IN.plusDays(3), 3, 1, 2, 0, "USD",
                total, paymentRule, false, "Non-refundable");
        return new CartSnapshot("C-1", "ACTIVE", room, List.of(new CartLine("ROOM", "Standard King", 1, total)),
                new CartTotals(total), "USD", "v1");
    }
}
