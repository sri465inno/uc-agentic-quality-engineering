package com.hotelbooking.hotel.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.common.money.Money;
import com.hotelbooking.hotel.domain.Hotel;
import com.hotelbooking.hotel.domain.PaymentRule;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Request and response shapes for hotel-service. */
public final class HotelApi {

    private HotelApi() {
    }

    public enum Availability {
        AVAILABLE,
        LIMITED,
        SOLD_OUT
    }

    public enum Sort {
        RECOMMENDED,
        PRICE_ASC,
        PRICE_DESC,
        DISTANCE,
        CATEGORY
    }

    /** Story 4.1: name, location, image, starting price, currency, availability and fee disclosure. */
    public record HotelSummary(String hotelId, String name, String city, String address, double distanceKm, int category,
            String image, List<String> amenities, Money startingNightly, Money startingStayTotal, String currency,
            Availability availability, boolean bookable, String priceQualification, String startingRatePlan,
            String startingRoom) {
    }

    public record AppliedFilter(String name, String value, String removeHint) {
    }

    public record AvailabilityPage(String destination, LocalDate checkIn, LocalDate checkOut, int rooms, int adults,
            int children, List<HotelSummary> results, int page, int size, int totalResults, int totalPages,
            int unfilteredResults, Sort sort, List<Sort> sortOptions, List<AppliedFilter> appliedFilters,
            boolean resetAvailable, List<String> availableAmenities) {
    }

    public record RatePlanOption(String code, String name, boolean refundable, boolean breakfastIncluded,
            PaymentRule paymentRule, String cancellationTerms, String restrictions, Money averageNightly, Money roomCharge,
            Money taxes, Money mandatoryFees, Money total, String priceVersion) {
    }

    public record RoomOption(String code, String name, String description, int maxAdults, int maxChildren,
            List<String> amenities, int roomsLeft, boolean fitsParty, boolean selectable, List<RatePlanOption> ratePlans) {
    }

    /** Story 4.3: description, images, location, amenities, rooms, pricing, policies and restrictions. */
    public record HotelDetail(String hotelId, String name, String city, String address, double distanceKm, int category,
            String description, List<String> images, List<String> amenities, Hotel.Policies policies,
            String mandatoryFeeDisclosure, String currency, List<RoomOption> rooms) {
    }

    public record QuoteRequest(@NotBlank String roomCode, @NotBlank String ratePlanCode, @NotNull LocalDate checkIn,
            @NotNull LocalDate checkOut, @Min(1) int rooms, @Min(1) int adults, @Min(0) int children,
            String expectedPriceVersion) {
    }

    /** Authoritative price and availability for one selection; carts revalidate against this (stories 4.3, 6.1, 6.3). */
    public record Quote(String hotelId, String hotelName, String city, String address, String checkInFrom,
            String checkOutUntil, String destination, List<String> hotelAmenities,
            String roomCode, String roomName,
            String ratePlanCode, String ratePlanName, LocalDate checkIn, LocalDate checkOut, long nights, int rooms,
            int adults, int children, String currency, Money roomCharge, Money taxes, Money mandatoryFees, Money total,
            PaymentRule paymentRule, boolean refundable, String cancellationTerms, String restrictions, int roomsLeft,
            boolean available, String priceVersion, boolean priceChanged, String notice) {
    }

    public record CommitmentRequest(@NotBlank String reference, @NotBlank String hotelId, @NotBlank String roomCode,
            @NotNull LocalDate checkIn, @NotNull LocalDate checkOut, @Min(1) int rooms) {
    }

    public record RateChange(@NotNull BigDecimal nightly) {
    }

    public record CapacityChange(@NotBlank String hotelId, String roomCode, @Min(0) int rooms) {
    }
}
