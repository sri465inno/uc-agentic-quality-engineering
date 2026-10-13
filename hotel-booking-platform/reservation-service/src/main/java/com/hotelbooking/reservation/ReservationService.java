package com.hotelbooking.reservation;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.hotelbooking.common.events.EventNames;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.money.Money;
import com.hotelbooking.common.privacy.FieldCipher;
import com.hotelbooking.common.privacy.Masking;
import com.hotelbooking.common.resilience.DependencyUnavailableException;
import com.hotelbooking.common.web.ApiException;
import com.hotelbooking.common.web.FieldIssue;
import com.hotelbooking.reservation.PaymentGateway.Authorization;
import com.hotelbooking.reservation.ReservationApi.CartRoom;
import com.hotelbooking.reservation.ReservationApi.CartSnapshot;
import com.hotelbooking.reservation.ReservationApi.CommitmentRequest;
import com.hotelbooking.reservation.ReservationApi.ConfirmationRequest;
import com.hotelbooking.reservation.ReservationApi.Guest;
import com.hotelbooking.reservation.ReservationApi.HotelInfo;
import com.hotelbooking.reservation.ReservationApi.InventoryStatus;
import com.hotelbooking.reservation.ReservationApi.Item;
import com.hotelbooking.reservation.ReservationApi.OpsView;
import com.hotelbooking.reservation.ReservationApi.Outcome;
import com.hotelbooking.reservation.ReservationApi.PaymentStatus;
import com.hotelbooking.reservation.ReservationApi.PaymentSummary;
import com.hotelbooking.reservation.ReservationApi.ReconciliationRow;
import com.hotelbooking.reservation.ReservationApi.ReservationRequest;
import com.hotelbooking.reservation.ReservationApi.Status;

import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** Stories 7.1-7.3 (AQPI-19..21) and the reservation side of 9.1 (AQPI-28). */
@Service
public class ReservationService {

    public static final String PAY_NOW = "PAY_NOW";
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._-]{7,64}");
    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    public record Submission(Outcome outcome, boolean replay) {
    }

    private final Map<String, Reservation> byKey = new ConcurrentHashMap<>();
    private final Map<String, Reservation> byId = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final GuestValidator validator;
    private final PaymentGateway gateway;
    private final Downstream downstream;
    private final FieldCipher cipher;
    private final ReservationProperties properties;
    private final EventPublisher events;
    private final Clock clock;

    public ReservationService(GuestValidator validator, PaymentGateway gateway, Downstream downstream, FieldCipher cipher,
            ReservationProperties properties, EventPublisher events, Clock clock) {
        this.validator = validator;
        this.gateway = gateway;
        this.downstream = downstream;
        this.cipher = cipher;
        this.properties = properties;
        this.events = events;
        this.clock = clock;
    }

    /** Story 7.2 AC1: show the amount due now versus at the hotel before payment. */
    public Mono<PaymentSummary> paymentSummary(String cartId) {
        return downstream.checkout(cartId).map(cart -> {
            Money total = cart.totals().total();
            boolean payNow = PAY_NOW.equals(cart.room().paymentRule());
            Money zero = Money.zero(cart.currency());
            String message = payNow ? "You will be charged " + total.amount().toPlainString() + " " + total.currency() + " now."
                    : "Nothing is charged now. Your card guarantees the booking and you pay "
                            + total.amount().toPlainString() + " " + total.currency() + " at the hotel.";
            return new PaymentSummary(cartId, cart.room().paymentRule(), payNow ? total : zero, payNow ? zero : total, total,
                    message, properties.getPrivacyNoticeVersion(),
                    List.of("guest.firstName", "guest.lastName", "guest.email", "paymentToken", "privacyNoticeAccepted"));
        }).flatMap(s -> events.event(EventNames.CHECKOUT_FORM).attr("cartId", cartId).attr("paymentRule", s.paymentRule())
                .publish().thenReturn(s));
    }

    /** Story 7.3: one reservation and at most one authorisation per idempotency key. */
    public Mono<Submission> submit(String idempotencyKey, ReservationRequest request) {
        if (idempotencyKey == null || !KEY.matcher(idempotencyKey).matches()) {
            return Mono.error(new ApiException(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUIRED",
                    "An Idempotency-Key header of 8-64 letters, digits, dots, dashes or underscores is required."));
        }
        List<FieldIssue> issues = validator.validate(request);
        if (!issues.isEmpty()) {
            return events.event(EventNames.CHECKOUT_FORM).outcome("invalid")
                    .attr("rules", issues.stream().map(FieldIssue::ruleId).toList()).publish()
                    .then(Mono.error(new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED",
                            "Please correct the highlighted fields.", false, issues)));
        }
        String fingerprint = fingerprint(request);
        Reservation reservation;
        synchronized (this) {
            Reservation existing = byKey.get(idempotencyKey);
            if (existing != null && existing.createdAt.plus(properties.getIdempotencyTtl()).isBefore(clock.instant())) {
                byKey.remove(idempotencyKey);
                existing = null;
            }
            if (existing != null) {
                if (!existing.fingerprint.equals(fingerprint)) {
                    return Mono.error(new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_KEY_REUSED",
                            "This request doesn't match the booking already submitted with the same key. Please start a new booking attempt."));
                }
                return Mono.just(new Submission(outcome(existing), true));
            }
            reservation = new Reservation("R-" + UUID.randomUUID().toString().substring(0, 8), idempotencyKey, fingerprint,
                    request.cartId(), clock.instant());
            byKey.put(idempotencyKey, reservation);
            byId.put(reservation.id, reservation);
        }
        return downstream.checkout(request.cartId())
                .onErrorResume(e -> {
                    byKey.remove(idempotencyKey);
                    byId.remove(reservation.id);
                    return Mono.error(e);
                })
                .flatMap(cart -> {
                    capture(reservation, request, cart);
                    return authorize(reservation);
                })
                .then(Mono.fromSupplier(() -> new Submission(outcome(reservation), false)));
    }

    /** Story 7.3 AC4: resolve PENDING_UNKNOWN and inventory-unknown MANUAL_REVIEW cases. */
    public Mono<Outcome> reconcile(String reservationId) {
        Reservation r = find(reservationId);
        if (r.status == Status.PENDING_UNKNOWN) {
            Optional<Authorization> auth = gateway.lookup(r.idempotencyKey);
            if (auth.isPresent() && auth.get().result() == PaymentGateway.Result.AUTHORIZED) {
                r.paymentStatus = PaymentStatus.AUTHORIZED;
                r.authorizedAmount = auth.get().amount();
                note(r, "reconciled: payment authorised");
                return commitAndConfirm(r).then(Mono.fromSupplier(() -> outcome(r)));
            }
            r.paymentStatus = PaymentStatus.NOT_ATTEMPTED;
            return finish(r, Status.FAILED, "PAYMENT_NOT_FOUND").then(Mono.fromSupplier(() -> outcome(r)));
        }
        if (r.status == Status.MANUAL_REVIEW && r.inventoryStatus == InventoryStatus.UNKNOWN) {
            return commitAndConfirm(r).then(Mono.fromSupplier(() -> outcome(r)));
        }
        return Mono.just(outcome(r));
    }

    public Mono<Outcome> view(String reservationId) {
        Reservation r = find(reservationId);
        return events.event(EventNames.OUTCOME_VIEWED).attr("reservationId", r.id).attr("status", r.status.name())
                .publish().then(Mono.fromSupplier(() -> outcome(r)));
    }

    public List<ReconciliationRow> reconciliation() {
        Map<String, Authorization> ledger = new ConcurrentHashMap<>();
        gateway.ledger().forEach(a -> ledger.put(a.key(), a));
        return byId.values().stream().sorted(Comparator.comparing(r -> r.createdAt)).map(r -> {
            Authorization a = ledger.get(r.idempotencyKey);
            boolean heldAtProvider = a != null && a.authorizationId() != null && !a.voided();
            boolean consistent = switch (r.status) {
                case CONFIRMED -> heldAtProvider && r.paymentStatus == PaymentStatus.AUTHORIZED
                        && r.inventoryStatus == InventoryStatus.COMMITTED;
                case PAYMENT_DECLINED, FAILED -> !heldAtProvider && r.inventoryStatus != InventoryStatus.COMMITTED;
                default -> false;
            };
            String note = consistent ? "Booking, payment and inventory agree"
                    : r.status == Status.PENDING_UNKNOWN || r.status == Status.MANUAL_REVIEW ? "Needs reconciliation"
                            : "Mismatch between booking, payment and inventory";
            Money total = r.cart == null ? null : r.cart.totals().total();
            return new ReconciliationRow(r.id, r.status, r.paymentStatus, r.inventoryStatus, total, r.authorizedAmount,
                    consistent, note);
        }).toList();
    }

    public List<Outcome> manualReview() {
        return byId.values().stream().filter(r -> r.status == Status.MANUAL_REVIEW || r.status == Status.PENDING_UNKNOWN)
                .map(this::outcome).toList();
    }

    /** Story 9.1 AC3: support sees masked data; only the privacy officer sees full values; both are audited. */
    public Mono<OpsView> opsView(String reservationId, String role) {
        boolean unmasked = "PRIVACY_OFFICER".equals(role);
        if (!unmasked && !"SUPPORT".equals(role)) {
            return Mono.error(new ApiException(HttpStatus.FORBIDDEN, "ROLE_NOT_PERMITTED",
                    "Your role is not permitted to view reservation details."));
        }
        Reservation r = find(reservationId);
        return events.event(EventNames.AUDIT_ACCESS).attr("resource", "reservation").attr("reservationId", r.id)
                .attr("role", role).attr("unmasked", unmasked).publish().then(Mono.fromSupplier(() -> {
                    String first = open(r.firstNameSealed);
                    String last = open(r.lastNameSealed);
                    String email = open(r.emailSealed);
                    String phone = open(r.phoneSealed);
                    String name = r.anonymized ? "[deleted]" : unmasked ? first + " " + last
                            : first.charAt(0) + ". " + last.charAt(0) + "***";
                    return new OpsView(r.id, r.status, r.confirmationNumber, name,
                            r.anonymized ? "[deleted]" : unmasked ? email : Masking.email(email),
                            r.anonymized || phone == null ? null : unmasked ? phone : Masking.phone(phone),
                            r.privacyNoticeVersion, r.marketingOptIn, r.paymentStatus, r.inventoryStatus,
                            List.copyOf(r.history));
                }));
    }

    /** Story 9.1 AC5: anonymise personal data once the retention period after check-out has passed. */
    public int purgeExpired() {
        LocalDate today = LocalDate.now(clock);
        int purged = 0;
        for (Reservation r : byId.values()) {
            synchronized (r) {
                if (!r.anonymized && r.cart != null
                        && r.cart.room().checkOut().plusDays(properties.getRetentionDays()).isBefore(today)) {
                    r.firstNameSealed = null;
                    r.lastNameSealed = null;
                    r.emailSealed = null;
                    r.phoneSealed = null;
                    r.paymentToken = null;
                    r.anonymized = true;
                    note(r, "personal data anonymised after retention period");
                    purged++;
                }
            }
        }
        return purged;
    }

    public void reset() {
        byKey.clear();
        byId.clear();
        gateway.reset();
    }

    private void capture(Reservation r, ReservationRequest request, CartSnapshot cart) {
        Guest g = request.guest();
        synchronized (r) {
            r.cart = cart;
            r.paymentToken = request.paymentToken();
            r.firstNameSealed = cipher.encrypt(g.firstName().trim());
            r.lastNameSealed = cipher.encrypt(g.lastName().trim());
            r.emailSealed = cipher.encrypt(g.email().trim());
            r.phoneSealed = g.phone() == null || g.phone().isBlank() ? null : cipher.encrypt(g.phone().trim());
            r.locale = request.locale();
            r.marketingOptIn = request.marketingOptIn();
            r.privacyNoticeVersion = properties.getPrivacyNoticeVersion();
            note(r, "cart " + cart.cartId() + " revalidated at " + cart.totals().total().amount().toPlainString());
        }
    }

    private Mono<Void> authorize(Reservation r) {
        boolean payNow = PAY_NOW.equals(r.cart.room().paymentRule());
        Money amount = payNow ? r.cart.totals().total() : Money.zero(r.cart.currency());
        String mode = payNow ? "CHARGE" : "GUARANTEE";
        return Mono.fromCallable(() -> gateway.authorize(r.idempotencyKey, r.paymentToken, amount, mode))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(auth -> events.event(EventNames.PAYMENT_AUTHORISATION)
                        .outcome(auth.result().name().toLowerCase(Locale.ROOT)).attr("reservationId", r.id)
                        .attr("mode", mode).attr("amount", amount.amount()).attr("currency", amount.currency())
                        .publish().thenReturn(auth))
                .flatMap(auth -> switch (auth.result()) {
                    case AUTHORIZED -> {
                        r.paymentStatus = PaymentStatus.AUTHORIZED;
                        r.authorizedAmount = amount;
                        note(r, "payment authorised (" + mode + ")");
                        yield commitAndConfirm(r);
                    }
                    case DECLINED -> {
                        r.paymentStatus = PaymentStatus.DECLINED;
                        yield finish(r, Status.PAYMENT_DECLINED, "PAYMENT_DECLINED");
                    }
                    case ERROR -> {
                        r.paymentStatus = PaymentStatus.ERROR;
                        yield finish(r, Status.FAILED, "PAYMENT_ERROR");
                    }
                    case TIMEOUT -> {
                        r.paymentStatus = PaymentStatus.UNKNOWN;
                        yield finish(r, Status.PENDING_UNKNOWN, "PAYMENT_RESPONSE_LOST");
                    }
                });
    }

    private Mono<Void> commitAndConfirm(Reservation r) {
        CartRoom room = r.cart.room();
        return downstream.commit(new CommitmentRequest(r.id, room.hotelId(), room.roomCode(), room.checkIn(),
                room.checkOut(), room.rooms()))
                .then(Mono.defer(() -> {
                    r.inventoryStatus = InventoryStatus.COMMITTED;
                    r.confirmationNumber = confirmationNumber();
                    return finish(r, Status.CONFIRMED, null).then(afterConfirm(r));
                }))
                .onErrorResume(ApiException.class, e -> {
                    note(r, "inventory commit rejected: " + e.code());
                    if (gateway.voidAuthorization(r.idempotencyKey)) {
                        r.paymentStatus = PaymentStatus.VOIDED;
                        return finish(r, Status.FAILED, "ROOM_UNAVAILABLE");
                    }
                    return finish(r, Status.MANUAL_REVIEW, "VOID_FAILED");
                })
                .onErrorResume(DependencyUnavailableException.class, e -> {
                    r.inventoryStatus = InventoryStatus.UNKNOWN;
                    return finish(r, Status.MANUAL_REVIEW, "INVENTORY_UNCONFIRMED");
                });
    }

    private Mono<Void> afterConfirm(Reservation r) {
        Mono<Void> cart = downstream.completeCart(r.cartId, r.id)
                .onErrorResume(e -> Mono.fromRunnable(() -> note(r, "cart completion deferred")));
        Mono<Void> notify = downstream.requestConfirmation(confirmation(r))
                .doOnNext(m -> {
                    r.notificationStatus = m.status();
                    note(r, "confirmation " + m.messageId() + " " + m.status());
                })
                .onErrorResume(e -> Mono.fromRunnable(() -> {
                    r.notificationStatus = "FAILED_TO_REQUEST";
                    note(r, "confirmation request failed; booking stays confirmed");
                }))
                .then();
        return cart.then(notify);
    }

    private Mono<Void> finish(Reservation r, Status status, String failureCode) {
        synchronized (r) {
            r.status = status;
            r.failureCode = failureCode;
            r.updatedAt = clock.instant();
            note(r, "status " + status + (failureCode == null ? "" : " (" + failureCode + ")"));
        }
        return events.event(EventNames.RESERVATION_STATUS).outcome(status.name().toLowerCase(Locale.ROOT))
                .attr("failureCode", failureCode).attr("reservationId", r.id).attr("payment", r.paymentStatus.name())
                .attr("inventory", r.inventoryStatus.name()).publish();
    }

    private ConfirmationRequest confirmation(Reservation r) {
        CartRoom room = r.cart.room();
        return new ConfirmationRequest(r.id, r.confirmationNumber, Status.CONFIRMED.name(), r.locale,
                open(r.firstNameSealed), open(r.lastNameSealed), open(r.emailSealed),
                new HotelInfo(room.hotelName(), room.address(), room.city(), room.checkInFrom(), room.checkOutUntil()),
                room.checkIn(), room.checkOut(), room.nights(), room.rooms(), room.adults(), room.children(),
                room.roomName(), room.ratePlanName(), items(r), r.cart.totals().total(), room.paymentRule(),
                room.cancellationTerms());
    }

    Outcome outcome(Reservation r) {
        synchronized (r) {
            String headline;
            boolean doNotResubmit;
            switch (r.status) {
                case CONFIRMED -> {
                    headline = "Your booking is confirmed";
                    doNotResubmit = true;
                }
                case PAYMENT_DECLINED -> {
                    headline = "Your payment was declined";
                    doNotResubmit = false;
                }
                case FAILED -> {
                    headline = "Your booking was not completed";
                    doNotResubmit = false;
                }
                case PENDING_UNKNOWN -> {
                    headline = "We're confirming your booking";
                    doNotResubmit = true;
                }
                case MANUAL_REVIEW -> {
                    headline = "Your booking is being checked";
                    doNotResubmit = true;
                }
                default -> {
                    headline = "Your booking is being processed";
                    doNotResubmit = true;
                }
            }
            CartRoom room = r.cart == null ? null : r.cart.room();
            return new Outcome(r.id, r.status, r.status == Status.CONFIRMED ? r.confirmationNumber : null, headline,
                    doNotResubmit, "/api/reservations/" + r.id, r.cart == null ? null : r.cart.totals().total(),
                    room == null ? null : room.paymentRule(), r.paymentStatus,
                    room == null ? null : room.cancellationTerms(),
                    r.anonymized || r.firstNameSealed == null ? null : open(r.firstNameSealed), r.notificationStatus,
                    r.updatedAt);
        }
    }

    private static List<Item> items(Reservation r) {
        List<Item> items = new ArrayList<>();
        r.cart.lines().stream().filter(l -> !"DISCOUNT".equals(l.type()) || l.amount().amount().signum() != 0)
                .forEach(l -> items.add(new Item(l.label(), l.quantity(), l.amount())));
        return items;
    }

    private Reservation find(String reservationId) {
        return Optional.ofNullable(byId.get(reservationId)).orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "RESERVATION_NOT_FOUND", "We could not find that booking."));
    }

    private String open(String sealed) {
        return sealed == null ? null : cipher.decrypt(sealed);
    }

    private void note(Reservation r, String text) {
        synchronized (r) {
            r.history.add(Instant.now(clock) + " " + text);
        }
    }

    private String confirmationNumber() {
        StringBuilder sb = new StringBuilder("HB");
        for (int i = 0; i < 8; i++) {
            sb.append(ALPHABET[random.nextInt(ALPHABET.length)]);
        }
        return sb.toString();
    }

    private static String fingerprint(ReservationRequest r) {
        Guest g = r.guest();
        return Masking.fingerprint(r.cartId(), g.firstName(), g.lastName(), g.email(), String.valueOf(g.phone()),
                String.valueOf(g.arrivalTime()), String.valueOf(g.specialRequests()), r.paymentToken(),
                String.valueOf(r.marketingOptIn()));
    }
}
