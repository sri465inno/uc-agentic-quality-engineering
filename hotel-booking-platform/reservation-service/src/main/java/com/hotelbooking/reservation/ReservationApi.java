package com.hotelbooking.reservation;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.common.money.Money;

/** Request and response shapes for reservation-service, plus mirrors of the cart, hotel and notification APIs. */
public final class ReservationApi {

    private ReservationApi() {
    }

    public enum Status {
        PROCESSING,
        CONFIRMED,
        PAYMENT_DECLINED,
        FAILED,
        PENDING_UNKNOWN,
        MANUAL_REVIEW
    }

    public enum PaymentStatus {
        NOT_ATTEMPTED,
        AUTHORIZED,
        DECLINED,
        ERROR,
        UNKNOWN,
        VOIDED
    }

    public enum InventoryStatus {
        NOT_COMMITTED,
        COMMITTED,
        UNKNOWN,
        RELEASED
    }

    /** Story 7.1: guest and contact details. Validated server-side by {@link GuestValidator}. */
    public record Guest(String firstName, String lastName, String email, String phone, String arrivalTime,
            String specialRequests) {
    }

    /** Story 7.2: only a tokenised payment reference from the payment provider's secure field is accepted. */
    public record ReservationRequest(String cartId, Guest guest, String paymentToken, boolean privacyNoticeAccepted,
            boolean marketingOptIn, String locale) {
    }

    public record PaymentSummary(String cartId, String paymentRule, Money payNow, Money payAtHotel, Money total,
            String message, String privacyNoticeVersion, List<String> requiredFields) {
    }

    public record Item(String label, int quantity, Money amount) {
    }

    /** Reservation status from the system of record. No confirmation number unless the reservation is confirmed. */
    public record Outcome(String reservationId, Status status, String confirmationNumber, String headline,
            boolean doNotResubmit, String statusUrl, Money total, String paymentRule, PaymentStatus paymentStatus,
            String cancellationTerms, String guestFirstName, String notificationStatus, Instant updatedAt) {
    }

    public record ReconciliationRow(String reservationId, Status status, PaymentStatus paymentStatus,
            InventoryStatus inventoryStatus, Money total, Money authorizedAmount, boolean consistent, String note) {
    }

    public record OpsView(String reservationId, Status status, String confirmationNumber, String guestName,
            String email, String phone, String privacyNoticeVersion, boolean marketingOptIn, PaymentStatus paymentStatus,
            InventoryStatus inventoryStatus, List<String> history) {
    }

    // ---- cart-service mirror ----
    public record CartRoom(String hotelId, String hotelName, String city, String address, String checkInFrom,
            String checkOutUntil, String roomCode, String roomName, String ratePlanCode, String ratePlanName,
            LocalDate checkIn, LocalDate checkOut, long nights, int rooms, int adults, int children, String currency,
            Money total, String paymentRule, boolean refundable, String cancellationTerms) {
    }

    public record CartLine(String type, String label, int quantity, Money amount) {
    }

    public record CartTotals(Money total) {
    }

    public record CartSnapshot(String cartId, String status, CartRoom room, List<CartLine> lines, CartTotals totals,
            String currency, String priceVersion) {
    }

    public record CompleteRequest(String reservationId) {
    }

    // ---- hotel-service mirror ----
    public record CommitmentRequest(String reference, String hotelId, String roomCode, LocalDate checkIn,
            LocalDate checkOut, int rooms) {
    }

    // ---- notification-service mirror ----
    public record HotelInfo(String name, String address, String city, String checkInFrom, String checkOutUntil) {
    }

    public record ConfirmationRequest(String reservationId, String confirmationNumber, String status, String locale,
            String guestFirstName, String guestLastName, String guestEmail, HotelInfo hotel, LocalDate checkIn,
            LocalDate checkOut, long nights, int rooms, int adults, int children, String roomName, String ratePlanName,
            List<Item> items, Money total, String paymentRule, String cancellationTerms) {
    }

    public record MessageStatus(String messageId, String status) {
    }
}
