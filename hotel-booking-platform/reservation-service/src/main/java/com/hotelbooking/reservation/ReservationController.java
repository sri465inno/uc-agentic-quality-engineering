package com.hotelbooking.reservation;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.hotelbooking.reservation.PaymentGateway.Authorization;
import com.hotelbooking.reservation.ReservationApi.OpsView;
import com.hotelbooking.reservation.ReservationApi.Outcome;
import com.hotelbooking.reservation.ReservationApi.PaymentSummary;
import com.hotelbooking.reservation.ReservationApi.ReconciliationRow;
import com.hotelbooking.reservation.ReservationApi.ReservationRequest;
import com.hotelbooking.reservation.ReservationApi.Status;

import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api")
public class ReservationController {

    public static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
    public static final String ROLE_HEADER = "X-Operator-Role";

    private final ReservationService reservations;
    private final PaymentGateway gateway;

    public ReservationController(ReservationService reservations, PaymentGateway gateway) {
        this.reservations = reservations;
        this.gateway = gateway;
    }

    /** Story 7.2 AC1. */
    @GetMapping("/checkout/{cartId}/payment-summary")
    public Mono<PaymentSummary> summary(@PathVariable String cartId) {
        return reservations.paymentSummary(cartId);
    }

    /** Stories 7.1-7.3: 201 for a new reservation, 200 for an idempotent replay, 202 while still processing. */
    @PostMapping("/reservations")
    public Mono<ResponseEntity<Outcome>> submit(@RequestHeader(value = IDEMPOTENCY_HEADER, required = false) String key,
            @RequestBody ReservationRequest request) {
        return reservations.submit(key, request).map(s -> ResponseEntity
                .status(s.outcome().status() == Status.PROCESSING ? HttpStatus.ACCEPTED
                        : s.replay() ? HttpStatus.OK : HttpStatus.CREATED)
                .body(s.outcome()));
    }

    /** Reservation status from the system of record. */
    @GetMapping("/reservations/{id}")
    public Mono<Outcome> view(@PathVariable String id) {
        return reservations.view(id);
    }

    @PostMapping("/reservations/{id}/reconcile")
    public Mono<Outcome> reconcile(@PathVariable String id) {
        return reservations.reconcile(id);
    }

    @GetMapping("/ops/reconciliation")
    public Mono<List<ReconciliationRow>> reconciliation() {
        return Mono.fromSupplier(reservations::reconciliation);
    }

    @GetMapping("/ops/manual-review")
    public Mono<List<Outcome>> manualReview() {
        return Mono.fromSupplier(reservations::manualReview);
    }

    @GetMapping("/ops/payments")
    public Mono<List<Authorization>> payments() {
        return Mono.fromSupplier(gateway::ledger);
    }

    /** Story 9.1 AC3. */
    @GetMapping("/ops/reservations/{id}")
    public Mono<OpsView> ops(@PathVariable String id, @RequestHeader(value = ROLE_HEADER, required = false) String role) {
        return reservations.opsView(id, role);
    }

    /** Story 9.1 AC5. */
    @PostMapping("/ops/retention/purge")
    public Mono<Map<String, Integer>> purge() {
        return Mono.fromSupplier(() -> Map.of("anonymised", reservations.purgeExpired()));
    }

    @PostMapping("/admin/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> reset() {
        return Mono.fromRunnable(reservations::reset);
    }
}
