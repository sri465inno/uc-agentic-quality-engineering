package com.hotelbooking.hotel.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.hotelbooking.common.events.EventNames;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.web.ApiException;
import com.hotelbooking.hotel.api.HotelApi.AvailabilityPage;
import com.hotelbooking.hotel.api.HotelApi.CapacityChange;
import com.hotelbooking.hotel.api.HotelApi.CommitmentRequest;
import com.hotelbooking.hotel.api.HotelApi.HotelDetail;
import com.hotelbooking.hotel.api.HotelApi.Quote;
import com.hotelbooking.hotel.api.HotelApi.QuoteRequest;
import com.hotelbooking.hotel.api.HotelApi.RateChange;
import com.hotelbooking.hotel.api.HotelApi.Sort;
import com.hotelbooking.hotel.domain.Catalog;
import com.hotelbooking.hotel.domain.Inventory;
import com.hotelbooking.hotel.domain.RatePlan;

import jakarta.validation.Valid;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api")
public class HotelController {

    private final HotelQueries queries;
    private final Catalog catalog;
    private final Inventory inventory;
    private final EventPublisher events;

    public HotelController(HotelQueries queries, Catalog catalog, Inventory inventory, EventPublisher events) {
        this.queries = queries;
        this.catalog = catalog;
        this.inventory = inventory;
        this.events = events;
    }

    /** Story 4.1 (AQPI-7): results in recommended order, page by page. */
    @GetMapping("/hotels/availability")
    public Mono<AvailabilityPage> availability(@RequestParam String destination,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkIn,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkOut,
            @RequestParam(defaultValue = "1") int rooms, @RequestParam(defaultValue = "2") int adults,
            @RequestParam(defaultValue = "0") int children, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Sort order = Sort.RECOMMENDED;
        return Mono.fromSupplier(() -> queries.availability(
                new HotelQueries.Stay(destination, checkIn, checkOut, rooms, adults, children),
                new HotelQueries.Filters(null, null, List.of(), null, null), order, page, size))
                .flatMap(result -> events.event(result.appliedFilters().isEmpty() && order == Sort.RECOMMENDED
                        ? EventNames.RESULTS_IMPRESSION : EventNames.RESULTS_REFINED)
                        .attr("destination", result.destination()).attr("results", result.totalResults())
                        .attr("filters", result.appliedFilters().size()).attr("sort", order.name())
                        .publish().thenReturn(result));
    }

    /** Story 4.3 (AQPI-9). */
    @GetMapping("/hotels/{hotelId}")
    public Mono<HotelDetail> detail(@PathVariable String hotelId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkIn,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkOut,
            @RequestParam(defaultValue = "1") int rooms, @RequestParam(defaultValue = "2") int adults,
            @RequestParam(defaultValue = "0") int children) {
        return Mono.fromSupplier(() -> queries.detail(hotelId,
                new HotelQueries.Stay(null, checkIn, checkOut, rooms, adults, children)))
                .flatMap(d -> events.event(EventNames.HOTEL_VIEWED).attr("hotelId", hotelId).publish().thenReturn(d));
    }

    /** Stories 4.3, 6.1 and 6.3: authoritative price and inventory for a selection. */
    @PostMapping("/hotels/{hotelId}/quotes")
    public Mono<Quote> quote(@PathVariable String hotelId, @Valid @RequestBody QuoteRequest request) {
        return Mono.fromSupplier(() -> queries.quote(hotelId, request))
                .flatMap(q -> events.event(EventNames.RATE_SELECTED).attr("hotelId", hotelId)
                        .attr("roomCode", q.roomCode()).attr("ratePlan", q.ratePlanCode()).attr("available", q.available())
                        .attr("priceChanged", q.priceChanged()).publish().thenReturn(q));
    }

    /** Story 7.3: inventory commitment by reservation-service, idempotent by reference. */
    @PostMapping("/inventory/commitments")
    public Mono<Inventory.Commitment> commit(@Valid @RequestBody CommitmentRequest request) {
        return Mono.fromSupplier(() -> inventory.commit(new Inventory.Commitment(request.reference(), request.hotelId(),
                request.roomCode(), request.checkIn(), request.checkOut(), request.rooms()))
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "INVENTORY_UNAVAILABLE",
                        "The selected room is no longer available for these dates.")));
    }

    @DeleteMapping("/inventory/commitments/{reference}")
    public Mono<Map<String, Object>> release(@PathVariable String reference) {
        return Mono.fromSupplier(() -> Map.of("reference", reference, "released", inventory.release(reference)));
    }

    @GetMapping("/inventory/commitments")
    public Mono<List<Inventory.Commitment>> commitments() {
        return Mono.fromSupplier(inventory::commitments);
    }

    /** Demo control: change a nightly rate. */
    @PutMapping("/admin/hotels/{hotelId}/rooms/{roomCode}/rates/{rateCode}")
    public Mono<RatePlan> changeRate(@PathVariable String hotelId, @PathVariable String roomCode,
            @PathVariable String rateCode, @Valid @RequestBody RateChange change) {
        return Mono.fromSupplier(() -> catalog.setNightly(hotelId, roomCode, rateCode, change.nightly())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RATE_PLAN_NOT_FOUND", "Unknown rate plan.")));
    }

    /** Demo control: set rooms available for a hotel (or one room type). */
    @PutMapping("/admin/inventory")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> changeCapacity(@Valid @RequestBody CapacityChange change) {
        return Mono.fromRunnable(() -> inventory.setCapacity(change.hotelId(), change.roomCode(), change.rooms()));
    }

    @PostMapping("/admin/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> reset() {
        return Mono.fromRunnable(() -> {
            catalog.reset();
            inventory.reset();
        });
    }

}
