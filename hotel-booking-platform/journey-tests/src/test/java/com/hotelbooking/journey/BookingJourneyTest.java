package com.hotelbooking.journey;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.test.web.reactive.server.WebTestClient;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * End-to-end journeys across search, hotel, offer, cart, reservation and notification services, traced to the
 * AQPI backlog (initiative AQPI-1). Each test name starts with the Jira keys it covers.
 */
@Tag("e2e")
class BookingJourneyTest {

    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(30).with(TemporalAdjusters.next(DayOfWeek.MONDAY));
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(3);
    private static Platform platform;

    @BeforeAll
    static void start() {
        platform = new Platform();
    }

    @AfterAll
    static void stop() {
        platform.close();
    }

    @BeforeEach
    void reset() {
        platform.reset();
    }

    @Test
    @DisplayName("AQPI-3 AQPI-7 AQPI-9 AQPI-11 AQPI-15 AQPI-16 AQPI-19 AQPI-20 AQPI-21 AQPI-24 AQPI-25 AQPI-29: search to confirmed booking and e-mail")
    void happyPathBooking() {
        JsonNode search = post("search-service", "/api/searches", Map.of("destination", "NYC", "checkIn", CHECK_IN,
                "checkOut", CHECK_OUT, "rooms", 1, "adults", 2, "children", 0), HttpStatus.OK);
        assertThat(search.path("status").asText()).isEqualTo("RESULTS");
        assertThat(search.path("criteria").path("nights").asInt()).isEqualTo(3);
        assertThat(search.path("page").path("results").size()).isGreaterThan(0);
        JsonNode first = search.path("page").path("results").get(0);
        assertThat(first.path("startingNightly").path("amount").isMissingNode()).isFalse();

        JsonNode detail = get("hotel-service", "/api/hotels/H-NYC-001?checkIn=" + CHECK_IN + "&checkOut=" + CHECK_OUT);
        assertThat(detail.path("rooms").size()).isEqualTo(3);
        assertThat(detail.path("policies").path("checkInFrom").asText()).isEqualTo("15:00");

        Map<String, Object> offerContext = new HashMap<>(Map.of("hotelId", "H-NYC-001", "destination", "NYC", "checkIn",
                CHECK_IN, "checkOut", CHECK_OUT, "roomCode", "STD-K", "ratePlanCode", "FLEX", "adults", 2, "children", 0,
                "currency", "USD"));
        offerContext.put("hotelAmenities", List.of("wifi", "gym", "restaurant", "parking"));
        JsonNode offers = post("offer-service", "/api/offers/recommendations", offerContext, HttpStatus.OK);
        assertThat(offers.path("personalized").asBoolean()).isFalse();
        assertThat(offers.path("proceedWithoutOffers").asBoolean()).isTrue();
        assertThat(codes(offers.path("offers"))).contains("BREAKFAST").doesNotContain("SPA_ACCESS");
        assertThat(codes(offers.path("excluded"))).contains("SPA_ACCESS");

        JsonNode cart = createCart("H-NYC-001", "STD-K", "FLEX");
        String cartId = cart.path("cartId").asText();
        cart = post("cart-service", "/api/carts/" + cartId + "/ancillaries", Map.of("code", "BREAKFAST", "quantity", 1),
                HttpStatus.OK);
        assertThat(cart.path("totals").path("optionalExtras").path("amount").decimalValue()).isPositive();
        assertThat(cart.path("totals").path("total").path("amount").decimalValue())
                .isEqualByComparingTo(sum(cart.path("totals"), "roomCharge", "taxes", "mandatoryFees", "optionalExtras")
                        .subtract(cart.path("totals").path("discounts").path("amount").decimalValue().abs()));

        JsonNode summary = get("reservation-service", "/api/checkout/" + cartId + "/payment-summary");
        assertThat(summary.path("paymentRule").asText()).isEqualTo("PAY_AT_HOTEL");
        assertThat(summary.path("payNow").path("amount").decimalValue()).isZero();

        String key = "journey-" + UUID.randomUUID();
        JsonNode booked = reserve(key, cartId, "tok_visa_ok", "jane.doe@example.com", "journey-corr-0001",
                HttpStatus.CREATED);
        assertThat(booked.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(booked.path("confirmationNumber").asText()).startsWith("HB").hasSize(10);
        assertThat(booked.path("doNotResubmit").asBoolean()).isTrue();
        assertThat(booked.path("notificationStatus").asText()).isIn("SENT", "DELIVERED", "QUEUED");

        JsonNode replay = reserve(key, cartId, "tok_visa_ok", "jane.doe@example.com", null, HttpStatus.OK);
        assertThat(replay.path("reservationId").asText()).isEqualTo(booked.path("reservationId").asText());
        assertThat(get("reservation-service", "/api/ops/payments").size()).isEqualTo(1);
        assertThat(get("hotel-service", "/api/inventory/commitments").size()).isEqualTo(1);
        assertThat(get("cart-service", "/api/carts/" + cartId).path("status").asText()).isEqualTo("CHECKED_OUT");

        JsonNode email = get("notification-service", "/api/confirmations/" + booked.path("reservationId").asText());
        assertThat(email.path("confirmationNumber").asText()).isEqualTo(booked.path("confirmationNumber").asText());
        assertThat(email.path("recipient").asText()).isEqualTo("j***@e***.com");
        assertThat(email.path("html").asText()).contains("lang=\"en").contains("Harbor View Hotel")
                .doesNotContain("tok_visa_ok");

        assertThat(platform.events("notification-service")).anySatisfy(e -> {
            assertThat(e.name()).isEqualTo("confirmation.generated");
            assertThat(e.correlationId()).isEqualTo("journey-corr-0001");
        });
        assertThat(platform.events("reservation-service")).allSatisfy(e -> assertThat(e.attributes().toString())
                .doesNotContain("jane.doe@example.com").doesNotContain("tok_visa_ok"));
        assertThat(reconciliationConsistent()).isTrue();
    }

    @Test
    @DisplayName("AQPI-4: invalid search criteria are reported per field and nothing is searched")
    void invalidSearch() {
        JsonNode error = post("search-service", "/api/searches", Map.of("destination", "NYC", "checkIn",
                LocalDate.now().minusDays(1), "checkOut", LocalDate.now().minusDays(3), "rooms", 1, "adults", 0),
                HttpStatus.BAD_REQUEST);
        assertThat(error.path("code").asText()).isEqualTo("VALIDATION_FAILED");
        List<String> fields = new ArrayList<>();
        error.path("fieldIssues").forEach(f -> fields.add(f.path("field").asText()));
        assertThat(fields).contains("checkIn", "adults");
    }

    @Test
    @DisplayName("AQPI-5: sold-out destination returns NO_AVAILABILITY with helpful suggestions")
    void noAvailability() {
        for (String hotel : List.of("H-NYC-001", "H-NYC-002", "H-NYC-003", "H-NYC-004")) {
            platform.client("hotel-service").put().uri("/api/admin/inventory")
                    .bodyValue(Map.of("hotelId", hotel, "rooms", 0)).exchange().expectStatus().is2xxSuccessful();
        }
        JsonNode search = post("search-service", "/api/searches", Map.of("destination", "NYC", "checkIn", CHECK_IN,
                "checkOut", CHECK_OUT, "rooms", 1, "adults", 2, "children", 0), HttpStatus.OK);
        assertThat(search.path("status").asText()).isEqualTo("NO_AVAILABILITY");
        assertThat(search.path("suggestions").size()).isGreaterThan(0);
    }

    @Test
    @DisplayName("AQPI-17 AQPI-21: a price change must be acknowledged before the booking can be paid")
    void priceChangeNeedsAcknowledgement() {
        String cartId = createCart("H-NYC-001", "STD-K", "FLEX").path("cartId").asText();
        platform.client("hotel-service").put().uri("/api/admin/hotels/H-NYC-001/rooms/STD-K/rates/FLEX")
                .bodyValue(Map.of("nightly", 260)).exchange().expectStatus().is2xxSuccessful();

        JsonNode blocked = reserve("journey-" + UUID.randomUUID(), cartId, "tok_visa_ok", "jane@example.com", null,
                HttpStatus.CONFLICT);
        assertThat(blocked.path("code").asText()).isEqualTo("PRICE_CHANGE_REQUIRES_ACKNOWLEDGEMENT");
        assertThat(get("reservation-service", "/api/ops/payments").size()).isZero();

        JsonNode cart = get("cart-service", "/api/carts/" + cartId);
        assertThat(cart.path("requiresAcknowledgement").asBoolean()).isTrue();
        post("cart-service", "/api/carts/" + cartId + "/acknowledge", Map.of("priceVersion",
                cart.path("priceVersion").asText()), HttpStatus.OK);
        JsonNode booked = reserve("journey-" + UUID.randomUUID(), cartId, "tok_visa_ok", "jane@example.com", null,
                HttpStatus.CREATED);
        assertThat(booked.path("status").asText()).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("AQPI-20: a declined pay-now card books nothing and holds no inventory")
    void paymentDeclined() {
        String cartId = createCart("H-NYC-001", "STD-K", "SAVER").path("cartId").asText();
        JsonNode summary = get("reservation-service", "/api/checkout/" + cartId + "/payment-summary");
        assertThat(summary.path("payNow").path("amount").decimalValue())
                .isEqualByComparingTo(summary.path("total").path("amount").decimalValue());

        JsonNode outcome = reserve("journey-" + UUID.randomUUID(), cartId, "tok_decline", "jane@example.com", null,
                HttpStatus.CREATED);
        assertThat(outcome.path("status").asText()).isEqualTo("PAYMENT_DECLINED");
        assertThat(outcome.path("confirmationNumber").isNull()).isTrue();
        assertThat(outcome.path("doNotResubmit").asBoolean()).isFalse();
        assertThat(get("hotel-service", "/api/inventory/commitments").size()).isZero();
        assertThat(reconciliationConsistent()).isTrue();
    }

    @Test
    @DisplayName("AQPI-21: the last room is sold once; a second cart is told it is no longer available")
    void lastRoomSoldOnce() {
        platform.client("hotel-service").put().uri("/api/admin/inventory")
                .bodyValue(Map.of("hotelId", "H-NYC-002", "roomCode", "STD-K", "rooms", 1)).exchange()
                .expectStatus().is2xxSuccessful();
        String first = createCart("H-NYC-002", "STD-K", "FLEX").path("cartId").asText();
        String second = createCart("H-NYC-002", "STD-K", "FLEX").path("cartId").asText();
        assertThat(reserve("journey-" + UUID.randomUUID(), first, "tok_visa_ok", "a@example.com", null,
                HttpStatus.CREATED).path("status").asText()).isEqualTo("CONFIRMED");
        JsonNode rejected = reserve("journey-" + UUID.randomUUID(), second, "tok_visa_ok", "b@example.com", null,
                HttpStatus.CONFLICT);
        assertThat(rejected.path("code").asText()).isEqualTo("ROOM_NO_LONGER_AVAILABLE");
        assertThat(get("reservation-service", "/api/ops/payments").size()).isEqualTo(1);
    }

    @Test
    @DisplayName("AQPI-21: reusing an idempotency key with a different request is refused")
    void idempotencyMismatch() {
        String cartId = createCart("H-NYC-001", "STD-K", "FLEX").path("cartId").asText();
        String key = "journey-" + UUID.randomUUID();
        reserve(key, cartId, "tok_visa_ok", "jane@example.com", null, HttpStatus.CREATED);
        JsonNode error = reserve(key, cartId, "tok_other_card", "jane@example.com", null, HttpStatus.CONFLICT);
        assertThat(error.path("code").asText()).isEqualTo("IDEMPOTENCY_KEY_REUSED");
    }

    @Test
    @DisplayName("AQPI-21: a lost payment response is held as pending and reconciled without a second charge")
    void lostPaymentResponseReconciled() {
        String cartId = createCart("H-NYC-001", "STD-K", "FLEX").path("cartId").asText();
        JsonNode pending = reserve("journey-" + UUID.randomUUID(), cartId, "tok_timeout", "jane@example.com", null,
                HttpStatus.CREATED);
        assertThat(pending.path("status").asText()).isEqualTo("PENDING_UNKNOWN");
        assertThat(pending.path("doNotResubmit").asBoolean()).isTrue();

        JsonNode reconciled = post("reservation-service",
                "/api/reservations/" + pending.path("reservationId").asText() + "/reconcile", Map.of(), HttpStatus.OK);
        assertThat(reconciled.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(get("reservation-service", "/api/ops/payments").size()).isEqualTo(1);
        assertThat(reconciliationConsistent()).isTrue();
    }

    @Test
    @DisplayName("AQPI-26: resend answers generically and is rate limited per booking")
    void resendConfirmation() {
        String cartId = createCart("H-NYC-001", "STD-K", "FLEX").path("cartId").asText();
        JsonNode booked = reserve("journey-" + UUID.randomUUID(), cartId, "tok_visa_ok", "jane@example.com", null,
                HttpStatus.CREATED);
        String number = booked.path("confirmationNumber").asText();
        String good = resend(number, "Doe", HttpStatus.ACCEPTED).path("message").asText();
        String wrong = resend(number, "Smith", HttpStatus.ACCEPTED).path("message").asText();
        assertThat(wrong).isEqualTo(good);
        resend(number, "Doe", HttpStatus.ACCEPTED);
        resend(number, "Doe", HttpStatus.ACCEPTED);
        resend(number, "Doe", HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    @DisplayName("AQPI-19 AQPI-28: raw card numbers are rejected and never echoed back")
    void rawCardRejected() {
        String cartId = createCart("H-NYC-001", "STD-K", "FLEX").path("cartId").asText();
        String body = platform.client("reservation-service").post().uri("/api/reservations")
                .header("Idempotency-Key", "journey-" + UUID.randomUUID())
                .bodyValue(request(cartId, "4111 1111 1111 1111", "jane@example.com")).exchange()
                .expectStatus().isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY).expectBody(String.class).returnResult()
                .getResponseBody();
        assertThat(body).contains("VALIDATION_FAILED").doesNotContain("4111");
    }

    @Test
    @DisplayName("AQPI-12 AQPI-16 AQPI-31: an unavailable extra is refused without breaking the room booking")
    void unavailableExtraIsolated() {
        platform.client("offer-service").put().uri("/api/admin/offers/LATE_CHECKOUT/availability")
                .bodyValue(Map.of("available", false)).exchange().expectStatus().is2xxSuccessful();
        String cartId = createCart("H-NYC-001", "STD-K", "FLEX").path("cartId").asText();
        JsonNode error = post("cart-service", "/api/carts/" + cartId + "/ancillaries",
                Map.of("code", "LATE_CHECKOUT", "quantity", 1), HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(error.path("code").asText()).isEqualTo("EXTRA_NOT_AVAILABLE");
        assertThat(reserve("journey-" + UUID.randomUUID(), cartId, "tok_visa_ok", "jane@example.com", null,
                HttpStatus.CREATED).path("status").asText()).isEqualTo("CONFIRMED");
    }

    private JsonNode createCart(String hotelId, String room, String rate) {
        return post("cart-service", "/api/carts", Map.of("hotelId", hotelId, "roomCode", room, "ratePlanCode", rate,
                "checkIn", CHECK_IN, "checkOut", CHECK_OUT, "rooms", 1, "adults", 2, "children", 0), HttpStatus.CREATED);
    }

    private JsonNode reserve(String key, String cartId, String token, String email, String correlationId,
            HttpStatusCode expected) {
        WebTestClient.RequestBodySpec spec = platform.client("reservation-service").post().uri("/api/reservations")
                .header("Idempotency-Key", key);
        if (correlationId != null) {
            spec = spec.header("X-Correlation-Id", correlationId);
        }
        return spec.bodyValue(request(cartId, token, email)).exchange().expectStatus().isEqualTo(expected)
                .expectBody(JsonNode.class).returnResult().getResponseBody();
    }

    private static Map<String, Object> request(String cartId, String token, String email) {
        Map<String, Object> guest = new HashMap<>(Map.of("firstName", "Jane", "lastName", "Doe", "email", email,
                "phone", "+1 212 555 0100", "arrivalTime", "18:00"));
        return Map.of("cartId", cartId, "guest", guest, "paymentToken", token, "privacyNoticeAccepted", true,
                "marketingOptIn", false, "locale", "en");
    }

    private JsonNode resend(String number, String lastName, HttpStatusCode expected) {
        return post("notification-service", "/api/confirmations/resend",
                Map.of("confirmationNumber", number, "lastName", lastName), expected);
    }

    private boolean reconciliationConsistent() {
        JsonNode rows = get("reservation-service", "/api/ops/reconciliation");
        for (JsonNode row : rows) {
            if (!row.path("consistent").asBoolean()) {
                return false;
            }
        }
        return true;
    }

    private static JsonNode get(String service, String uri) {
        return platform.client(service).get().uri(uri).exchange().expectStatus().isOk().expectBody(JsonNode.class)
                .returnResult().getResponseBody();
    }

    private static JsonNode post(String service, String uri, Object body, HttpStatusCode expected) {
        return platform.client(service).post().uri(uri).bodyValue(body).exchange().expectStatus().isEqualTo(expected)
                .expectBody(JsonNode.class).returnResult().getResponseBody();
    }

    private static List<String> codes(JsonNode array) {
        List<String> codes = new ArrayList<>();
        array.forEach(n -> codes.add(n.path("code").asText()));
        return codes;
    }

    private static BigDecimal sum(JsonNode totals, String... fields) {
        BigDecimal total = BigDecimal.ZERO;
        for (String f : fields) {
            total = total.add(totals.path(f).path("amount").decimalValue());
        }
        return total;
    }
}
