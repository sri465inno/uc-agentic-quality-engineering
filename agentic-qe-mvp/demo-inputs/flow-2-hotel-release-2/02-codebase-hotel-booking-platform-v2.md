# cart-service/src/main/java/com/hotelbooking/cart/Cart.java
package com.hotelbooking.cart;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.hotelbooking.cart.CartApi.AncillaryLine;
import com.hotelbooking.cart.CartApi.PendingChange;
import com.hotelbooking.cart.CartApi.RoomSelection;
import com.hotelbooking.cart.CartApi.Status;

/** Mutable cart state; guarded by {@link CartService}. A cart never holds inventory (story 6.1 BR). */
final class Cart {

    final String id;
    final Instant createdAt;
    final Instant expiresAt;
    Status status = Status.ACTIVE;
    RoomSelection room;
    final Map<String, AncillaryLine> ancillaries = new LinkedHashMap<>();
    PendingChange pendingChange;
    final List<String> notices = new ArrayList<>();
    String reservationId;

    Cart(String id, Instant createdAt, Instant expiresAt, RoomSelection room) {
        this.id = id;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.room = room;
    }
}


# cart-service/src/main/java/com/hotelbooking/cart/CartApi.java
package com.hotelbooking.cart;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.common.money.Money;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Request and response shapes for cart-service, plus mirrors of the hotel and offer responses it consumes. */
public final class CartApi {

    private CartApi() {
    }

    public enum Status {
        ACTIVE,
        EXPIRED,
        CHECKED_OUT
    }

    public enum LineType {
        ROOM,
        TAX,
        MANDATORY_FEE,
        OPTIONAL_EXTRA,
        DISCOUNT
    }

    public record CreateCartRequest(@NotBlank String hotelId, @NotBlank String roomCode, @NotBlank String ratePlanCode,
            @NotNull LocalDate checkIn, @NotNull LocalDate checkOut, @Min(1) int rooms, @Min(1) int adults,
            @Min(0) int children, String priceVersion, String sessionId) {
    }

    public record ChangeRoomRequest(@NotBlank String roomCode, @NotBlank String ratePlanCode) {
    }

    public record AncillaryRequest(@NotBlank String code, @Min(1) int quantity) {
    }

    public record QuantityRequest(@Min(0) int quantity) {
    }

    public record AcknowledgeRequest(@NotBlank String priceVersion) {
    }

    public record CompleteRequest(@NotBlank String reservationId) {
    }

    /** Story 6.1 AC1: hotel, room, rate, dates, occupancy, quantity, currency and price components. */
    public record RoomSelection(String hotelId, String hotelName, String city, String address, String checkInFrom,
            String checkOutUntil, String destination,
            List<String> hotelAmenities, String roomCode, String roomName, String ratePlanCode, String ratePlanName,
            LocalDate checkIn, LocalDate checkOut, long nights, int rooms, int adults, int children, String currency,
            Money roomCharge, Money taxes, Money mandatoryFees, Money total, String paymentRule, boolean refundable,
            String cancellationTerms, String restrictions, String priceVersion) {
    }

    public record AncillaryLine(String code, String name, int quantity, int maxQuantity, Money unitPrice,
            String pricingUnit, Money linePrice) {
    }

    public record Line(LineType type, String label, int quantity, Money amount) {
    }

    public record Totals(Money roomCharge, Money taxes, Money mandatoryFees, Money optionalExtras, Money discounts,
            Money total) {
    }

    /** Story 6.3 AC3: what changed and by how much; must be acknowledged before checkout. */
    public record PendingChange(Money previousTotal, Money newTotal, Money difference, List<String> reasons) {
    }

    public record CartView(String cartId, Status status, Instant createdAt, Instant expiresAt, long secondsRemaining,
            String timeoutBehaviour, RoomSelection room, List<AncillaryLine> ancillaries, List<Line> lines,
            Totals totals, String currency, String priceVersion, PendingChange pendingChange,
            boolean requiresAcknowledgement, List<String> notices, List<String> editActions, String reservationId,
            String note) {
    }

    // ---- hotel-service quote mirror ----
    public record QuoteRequest(String roomCode, String ratePlanCode, LocalDate checkIn, LocalDate checkOut, int rooms,
            int adults, int children, String expectedPriceVersion) {
    }

    public record Quote(String hotelId, String hotelName, String city, String address, String checkInFrom,
            String checkOutUntil, String destination, List<String> hotelAmenities,
            String roomCode, String roomName, String ratePlanCode, String ratePlanName, LocalDate checkIn,
            LocalDate checkOut, long nights, int rooms, int adults, int children, String currency, Money roomCharge,
            Money taxes, Money mandatoryFees, Money total, String paymentRule, boolean refundable,
            String cancellationTerms, String restrictions, int roomsLeft, boolean available, String priceVersion,
            boolean priceChanged, String notice) {
    }

    // ---- offer-service validation mirror ----
    public record OfferContext(String hotelId, String destination, LocalDate checkIn, LocalDate checkOut,
            String roomCode, String ratePlanCode, int adults, int children, String currency, List<String> hotelAmenities,
            List<String> declaredInterests, String profileId, String sessionId) {
    }

    public record OfferItem(String code, int quantity) {
    }

    public record OfferValidationRequest(OfferContext context, List<OfferItem> items) {
    }

    public record OfferItemValidation(String code, String name, boolean eligible, boolean available, int quantity,
            int maxQuantity, boolean quantityAllowed, Money unitPrice, String pricingUnit, Money linePrice,
            String reason) {
    }

    public record OfferValidationResponse(List<OfferItemValidation> items, String rulesVersion) {
    }
}


# cart-service/src/main/java/com/hotelbooking/cart/CartController.java
package com.hotelbooking.cart;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.hotelbooking.cart.CartApi.AcknowledgeRequest;
import com.hotelbooking.cart.CartApi.AncillaryRequest;
import com.hotelbooking.cart.CartApi.CartView;
import com.hotelbooking.cart.CartApi.ChangeRoomRequest;
import com.hotelbooking.cart.CartApi.CompleteRequest;
import com.hotelbooking.cart.CartApi.CreateCartRequest;
import com.hotelbooking.cart.CartApi.QuantityRequest;

import jakarta.validation.Valid;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api")
public class CartController {

    private final CartService carts;

    public CartController(CartService carts) {
        this.carts = carts;
    }

    /** Story 6.1 (AQPI-15). */
    @PostMapping("/carts")
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<CartView> create(@Valid @RequestBody CreateCartRequest request) {
        return carts.create(request);
    }

    /** Story 6.3 (AQPI-17). */
    @GetMapping("/carts/{cartId}")
    public Mono<CartView> view(@PathVariable String cartId) {
        return carts.view(cartId);
    }

    /** Story 6.2 (AQPI-16). */
    @PostMapping("/carts/{cartId}/ancillaries")
    public Mono<CartView> add(@PathVariable String cartId, @Valid @RequestBody AncillaryRequest request) {
        return carts.addAncillary(cartId, request.code(), request.quantity());
    }

    @PutMapping("/carts/{cartId}/ancillaries/{code}")
    public Mono<CartView> update(@PathVariable String cartId, @PathVariable String code,
            @Valid @RequestBody QuantityRequest request) {
        return carts.updateAncillary(cartId, code, request.quantity());
    }

    @DeleteMapping("/carts/{cartId}/ancillaries/{code}")
    public Mono<CartView> remove(@PathVariable String cartId, @PathVariable String code) {
        return carts.removeAncillary(cartId, code);
    }

    @PutMapping("/carts/{cartId}/room")
    public Mono<CartView> changeRoom(@PathVariable String cartId, @Valid @RequestBody ChangeRoomRequest request) {
        return carts.changeRoom(cartId, request.roomCode(), request.ratePlanCode());
    }

    @PostMapping("/carts/{cartId}/revalidate")
    public Mono<CartView> revalidate(@PathVariable String cartId) {
        return carts.revalidate(cartId);
    }

    @PostMapping("/carts/{cartId}/acknowledge")
    public Mono<CartView> acknowledge(@PathVariable String cartId, @Valid @RequestBody AcknowledgeRequest request) {
        return carts.acknowledge(cartId, request.priceVersion());
    }

    /** Called by reservation-service: revalidated, acknowledged snapshot or 409/410. */
    @PostMapping("/carts/{cartId}/checkout")
    public Mono<CartView> checkout(@PathVariable String cartId) {
        return carts.checkout(cartId);
    }

    @PostMapping("/carts/{cartId}/complete")
    public Mono<CartView> complete(@PathVariable String cartId, @Valid @RequestBody CompleteRequest request) {
        return carts.complete(cartId, request.reservationId());
    }

    @PostMapping("/admin/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> reset() {
        return Mono.fromRunnable(carts::reset);
    }
}


# cart-service/src/main/java/com/hotelbooking/cart/CartProperties.java
package com.hotelbooking.cart;

import java.math.BigDecimal;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Cart expiry and the threshold above which a price change needs guest acknowledgement (stories 6.1, 6.3). */
@ConfigurationProperties("platform.cart")
public class CartProperties {

    private Duration ttl = Duration.ofMinutes(20);
    private BigDecimal materialChangePercent = new BigDecimal("1.0");

    public Duration getTtl() {
        return ttl;
    }

    public void setTtl(Duration ttl) {
        this.ttl = ttl;
    }

    public BigDecimal getMaterialChangePercent() {
        return materialChangePercent;
    }

    public void setMaterialChangePercent(BigDecimal materialChangePercent) {
        this.materialChangePercent = materialChangePercent;
    }
}


# cart-service/src/main/java/com/hotelbooking/cart/CartService.java
package com.hotelbooking.cart;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.hotelbooking.cart.CartApi.AncillaryLine;
import com.hotelbooking.cart.CartApi.CartView;
import com.hotelbooking.cart.CartApi.CreateCartRequest;
import com.hotelbooking.cart.CartApi.Line;
import com.hotelbooking.cart.CartApi.LineType;
import com.hotelbooking.cart.CartApi.OfferItem;
import com.hotelbooking.cart.CartApi.OfferItemValidation;
import com.hotelbooking.cart.CartApi.PendingChange;
import com.hotelbooking.cart.CartApi.Quote;
import com.hotelbooking.cart.CartApi.QuoteRequest;
import com.hotelbooking.cart.CartApi.RoomSelection;
import com.hotelbooking.cart.CartApi.Status;
import com.hotelbooking.cart.CartApi.Totals;
import com.hotelbooking.common.events.EventNames;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.money.Money;
import com.hotelbooking.common.privacy.Masking;
import com.hotelbooking.common.resilience.DependencyUnavailableException;
import com.hotelbooking.common.web.ApiException;

import reactor.core.publisher.Mono;

/** Stories 6.1, 6.2, 6.3 (AQPI-15, AQPI-16, AQPI-17). */
@Service
public class CartService {

    private final Map<String, Cart> carts = new ConcurrentHashMap<>();
    private final Downstream downstream;
    private final CartProperties properties;
    private final EventPublisher events;
    private final Clock clock;

    public CartService(Downstream downstream, CartProperties properties, EventPublisher events, Clock clock) {
        this.downstream = downstream;
        this.properties = properties;
        this.events = events;
        this.clock = clock;
    }

    public Mono<CartView> create(CreateCartRequest r) {
        QuoteRequest q = new QuoteRequest(r.roomCode(), r.ratePlanCode(), r.checkIn(), r.checkOut(), r.rooms(),
                r.adults(), r.children(), r.priceVersion());
        return downstream.quote(r.hotelId(), q).flatMap(quote -> {
            requireAvailable(quote);
            Instant now = clock.instant();
            Cart cart = new Cart("C-" + UUID.randomUUID().toString().substring(0, 8), now, now.plus(properties.getTtl()),
                    selection(quote));
            if (quote.priceChanged()) {
                cart.notices.add(quote.notice());
                cart.pendingChange = new PendingChange(null, quote.total(), null,
                        List.of("Room price changed since it was displayed"));
            }
            carts.put(cart.id, cart);
            return updated(cart, "room-added");
        });
    }

    public Mono<CartView> view(String cartId) {
        Cart cart = find(cartId);
        expireIfDue(cart);
        return events.event(EventNames.CART_VIEWED).attr("cartId", cartId).attr("status", cart.status.name()).publish()
                .then(Mono.fromSupplier(() -> render(cart)));
    }

    public Mono<CartView> addAncillary(String cartId, String code, int quantity) {
        Cart cart = active(cartId);
        int current = Optional.ofNullable(cart.ancillaries.get(code)).map(AncillaryLine::quantity).orElse(0);
        return setAncillary(cart, code, current + quantity);
    }

    public Mono<CartView> updateAncillary(String cartId, String code, int quantity) {
        Cart cart = active(cartId);
        if (!cart.ancillaries.containsKey(code)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "EXTRA_NOT_IN_CART", "That extra is not in your cart.");
        }
        if (quantity == 0) {
            return removeAncillary(cartId, code);
        }
        return setAncillary(cart, code, quantity);
    }

    public Mono<CartView> removeAncillary(String cartId, String code) {
        Cart cart = active(cartId);
        synchronized (cart) {
            if (cart.ancillaries.remove(code) == null) {
                throw new ApiException(HttpStatus.NOT_FOUND, "EXTRA_NOT_IN_CART", "That extra is not in your cart.");
            }
        }
        return updated(cart, "extra-removed");
    }

    /** Story 6.3 AC4: change room type or rate plan without starting again. */
    public Mono<CartView> changeRoom(String cartId, String roomCode, String ratePlanCode) {
        Cart cart = active(cartId);
        RoomSelection r = cart.room;
        return downstream.quote(r.hotelId(), new QuoteRequest(roomCode, ratePlanCode, r.checkIn(), r.checkOut(),
                r.rooms(), r.adults(), r.children(), null)).flatMap(quote -> {
                    requireAvailable(quote);
                    synchronized (cart) {
                        cart.room = selection(quote);
                        cart.pendingChange = null;
                    }
                    return revalidateExtras(cart, false).then(updated(cart, "room-changed"));
                });
    }

    /** Stories 6.1 AC2, 6.3 AC3: re-quote room and extras; material differences need acknowledgement. */
    public Mono<CartView> revalidate(String cartId) {
        Cart cart = active(cartId);
        return revalidateCart(cart).then(Mono.fromSupplier(() -> render(cart)));
    }

    public Mono<CartView> acknowledge(String cartId, String priceVersion) {
        Cart cart = active(cartId);
        synchronized (cart) {
            CartView current = render(cart);
            if (!current.priceVersion().equals(priceVersion)) {
                throw new ApiException(HttpStatus.CONFLICT, "PRICE_VERSION_MISMATCH",
                        "The total has changed again. Please review the latest total before continuing.");
            }
            cart.pendingChange = null;
            cart.notices.clear();
        }
        return events.event(EventNames.CART_PRICE_ACKNOWLEDGED).attr("cartId", cartId).publish()
                .then(Mono.fromSupplier(() -> render(cart)));
    }

    /** Story 6.3 BR: final payable total revalidated before reservation submission. */
    public Mono<CartView> checkout(String cartId) {
        Cart cart = active(cartId);
        return revalidateCart(cart).then(Mono.fromCallable(() -> {
            CartView view = render(cart);
            if (view.requiresAcknowledgement()) {
                throw new ApiException(HttpStatus.CONFLICT, "PRICE_CHANGE_REQUIRES_ACKNOWLEDGEMENT",
                        "Your total has changed. Please review and accept the new total before paying.");
            }
            return view;
        }));
    }

    public Mono<CartView> complete(String cartId, String reservationId) {
        Cart cart = find(cartId);
        synchronized (cart) {
            if (cart.status == Status.CHECKED_OUT && !reservationId.equals(cart.reservationId)) {
                throw new ApiException(HttpStatus.CONFLICT, "CART_ALREADY_CHECKED_OUT", "This cart was already booked.");
            }
            cart.status = Status.CHECKED_OUT;
            cart.reservationId = reservationId;
        }
        return Mono.fromSupplier(() -> render(cart));
    }

    public void reset() {
        carts.clear();
    }

    private Mono<Void> revalidateCart(Cart cart) {
        RoomSelection r = cart.room;
        Money before = render(cart).totals().total();
        return downstream.quote(r.hotelId(), new QuoteRequest(r.roomCode(), r.ratePlanCode(), r.checkIn(), r.checkOut(),
                r.rooms(), r.adults(), r.children(), r.priceVersion()))
                .flatMap(quote -> {
                    requireAvailable(quote);
                    List<String> reasons = new ArrayList<>();
                    synchronized (cart) {
                        if (!quote.priceVersion().equals(r.priceVersion())) {
                            reasons.add("Room price changed from " + r.total().amount().toPlainString() + " to "
                                    + quote.total().amount().toPlainString() + " " + quote.currency());
                            cart.room = selection(quote);
                        }
                    }
                    return revalidateExtras(cart, true).map(extraReasons -> {
                        reasons.addAll(extraReasons);
                        return reasons;
                    });
                })
                .doOnNext(reasons -> {
                    synchronized (cart) {
                        Money after = render(cart).totals().total();
                        if (!reasons.isEmpty() && material(before, after)) {
                            cart.pendingChange = new PendingChange(before, after, after.minus(before), List.copyOf(reasons));
                            cart.notices.addAll(reasons);
                        } else if (!reasons.isEmpty()) {
                            cart.notices.addAll(reasons);
                        }
                    }
                }).then();
    }

    /** Story 6.2 AC4: ineligible or sold-out extras are removed with a notice, never retained silently. */
    private Mono<List<String>> revalidateExtras(Cart cart, boolean dropWhenUnverifiable) {
        if (cart.ancillaries.isEmpty()) {
            return Mono.just(List.of());
        }
        List<OfferItem> items = cart.ancillaries.values().stream().map(a -> new OfferItem(a.code(), a.quantity())).toList();
        return downstream.validateOffers(cart.room, items).map(results -> {
            List<String> reasons = new ArrayList<>();
            synchronized (cart) {
                for (OfferItemValidation v : results) {
                    AncillaryLine line = cart.ancillaries.get(v.code());
                    if (line == null) {
                        continue;
                    }
                    if (!v.eligible() || !v.available() || !v.quantityAllowed()) {
                        cart.ancillaries.remove(v.code());
                        reasons.add(line.name() + " was removed: " + readable(v.reason()));
                    } else if (v.linePrice().amount().compareTo(line.linePrice().amount()) != 0) {
                        cart.ancillaries.put(v.code(), new AncillaryLine(v.code(), v.name(), v.quantity(), v.maxQuantity(),
                                v.unitPrice(), v.pricingUnit(), v.linePrice()));
                        reasons.add(line.name() + " price changed to " + v.linePrice().amount().toPlainString());
                    }
                }
            }
            return reasons;
        }).onErrorResume(DependencyUnavailableException.class, e -> {
            if (!dropWhenUnverifiable) {
                return Mono.just(List.of());
            }
            List<String> reasons = new ArrayList<>();
            synchronized (cart) {
                cart.ancillaries.values().forEach(a -> reasons.add(a.name()
                        + " was removed because optional extras could not be confirmed right now. Your room is unaffected."));
                cart.ancillaries.clear();
            }
            return Mono.just(reasons);
        });
    }

    private Mono<CartView> setAncillary(Cart cart, String code, int quantity) {
        return downstream.validateOffers(cart.room, List.of(new OfferItem(code, quantity)))
                .onErrorMap(DependencyUnavailableException.class, e -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                        "EXTRAS_UNAVAILABLE", "Optional extras can't be added right now. You can continue booking your room.",
                        true, List.of()))
                .flatMap(results -> {
                    OfferItemValidation v = results.get(0);
                    if (!v.eligible() || !v.available()) {
                        throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "EXTRA_NOT_AVAILABLE",
                                (v.name() == null ? "This extra" : v.name()) + " can't be added: " + readable(v.reason()));
                    }
                    if (!v.quantityAllowed()) {
                        throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "EXTRA_QUANTITY_LIMIT",
                                "You can add up to " + v.maxQuantity() + " of " + v.name() + ".");
                    }
                    synchronized (cart) {
                        cart.ancillaries.put(code, new AncillaryLine(v.code(), v.name(), v.quantity(), v.maxQuantity(),
                                v.unitPrice(), v.pricingUnit(), v.linePrice()));
                    }
                    return updated(cart, "extra-set");
                });
    }

    private Mono<CartView> updated(Cart cart, String change) {
        CartView view = render(cart);
        return events.event(EventNames.CART_UPDATED).attr("cartId", cart.id).attr("change", change)
                .attr("items", view.ancillaries().size() + 1).attr("total", view.totals().total().amount())
                .attr("currency", view.currency()).publish().thenReturn(view);
    }

    private boolean material(Money before, Money after) {
        if (before.amount().signum() == 0) {
            return after.amount().signum() != 0;
        }
        BigDecimal percent = after.amount().subtract(before.amount()).abs().multiply(BigDecimal.valueOf(100))
                .divide(before.amount(), 4, RoundingMode.HALF_UP);
        return percent.compareTo(properties.getMaterialChangePercent()) > 0;
    }

    CartView render(Cart cart) {
        synchronized (cart) {
            RoomSelection r = cart.room;
            String ccy = r.currency();
            Money extras = cart.ancillaries.values().stream().map(AncillaryLine::linePrice).reduce(Money.zero(ccy), Money::plus);
            Money discounts = Money.zero(ccy);
            Money total = r.total().plus(extras).minus(discounts);
            List<Line> lines = new ArrayList<>();
            lines.add(new Line(LineType.ROOM, r.roomName() + " - " + r.ratePlanName() + " x " + r.rooms() + " room(s), "
                    + r.nights() + " night(s)", r.rooms(), r.roomCharge()));
            lines.add(new Line(LineType.TAX, "Taxes", 1, r.taxes()));
            lines.add(new Line(LineType.MANDATORY_FEE, "Mandatory fees (payable as part of the room price)", 1, r.mandatoryFees()));
            cart.ancillaries.values().forEach(a -> lines.add(new Line(LineType.OPTIONAL_EXTRA, "Optional extra: " + a.name(),
                    a.quantity(), a.linePrice())));
            lines.add(new Line(LineType.DISCOUNT, "Discounts (none applied)", 0, discounts));
            Totals totals = new Totals(r.roomCharge(), r.taxes(), r.mandatoryFees(), extras, discounts, total);
            String version = Masking.fingerprint(r.priceVersion(), total.amount().toPlainString(),
                    String.join(",", cart.ancillaries.keySet())).substring(0, 16);
            long remaining = Math.max(0, Duration.between(clock.instant(), cart.expiresAt).toSeconds());
            return new CartView(cart.id, cart.status, cart.createdAt, cart.expiresAt, remaining,
                    "Your cart is held for " + properties.getTtl().toMinutes()
                            + " minutes. Rooms are not reserved until you complete booking; after expiry, price and availability are checked again.",
                    r, List.copyOf(cart.ancillaries.values()), lines, totals, ccy, version, cart.pendingChange,
                    cart.pendingChange != null, List.copyOf(cart.notices),
                    List.of("CHANGE_ROOM", "CHANGE_RATE_PLAN", "EDIT_EXTRAS", "CHANGE_DATES_WITH_NEW_SEARCH"),
                    cart.reservationId, "A cart is not a reservation.");
        }
    }

    private Cart find(String cartId) {
        return Optional.ofNullable(carts.get(cartId)).orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "CART_NOT_FOUND", "We could not find that cart."));
    }

    private Cart active(String cartId) {
        Cart cart = find(cartId);
        expireIfDue(cart);
        if (cart.status == Status.EXPIRED) {
            throw new ApiException(HttpStatus.GONE, "CART_EXPIRED",
                    "Your cart expired. Please select your room again so we can re-check price and availability.");
        }
        if (cart.status == Status.CHECKED_OUT) {
            throw new ApiException(HttpStatus.CONFLICT, "CART_ALREADY_CHECKED_OUT", "This cart has already been booked.");
        }
        return cart;
    }

    private void expireIfDue(Cart cart) {
        synchronized (cart) {
            if (cart.status == Status.ACTIVE && !clock.instant().isBefore(cart.expiresAt)) {
                cart.status = Status.EXPIRED;
            }
        }
    }

    private static void requireAvailable(Quote quote) {
        if (!quote.available()) {
            throw new ApiException(HttpStatus.CONFLICT, "ROOM_NO_LONGER_AVAILABLE",
                    quote.notice() == null ? "This room is no longer available." : quote.notice());
        }
    }

    private static RoomSelection selection(Quote q) {
        return new RoomSelection(q.hotelId(), q.hotelName(), q.city(), q.address(), q.checkInFrom(), q.checkOutUntil(),
                q.destination(), q.hotelAmenities(), q.roomCode(),
                q.roomName(), q.ratePlanCode(), q.ratePlanName(), q.checkIn(), q.checkOut(), q.nights(), q.rooms(),
                q.adults(), q.children(), q.currency(), q.roomCharge(), q.taxes(), q.mandatoryFees(), q.total(),
                q.paymentRule(), q.refundable(), q.cancellationTerms(), q.restrictions(), q.priceVersion());
    }

    private static String readable(String reason) {
        if (reason == null) {
            return "it is not available";
        }
        return switch (reason) {
            case "SOLD_OUT" -> "it is sold out";
            case "PARTY_HAS_NO_CHILDREN" -> "it is only for bookings with children";
            case "ALREADY_INCLUDED_IN_RATE" -> "it is already included in your rate";
            case "OUT_OF_SEASON" -> "it is not offered on your dates";
            case "STAY_TOO_SHORT" -> "your stay is too short for it";
            case "UNKNOWN_PRODUCT" -> "we don't offer it";
            default -> reason.startsWith("QUANTITY_LIMIT_") ? "the quantity is above the limit"
                    : "it is not offered for this hotel or stay";
        };
    }
}


# cart-service/src/main/java/com/hotelbooking/cart/CartServiceApplication.java
package com.hotelbooking.cart;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/** Epic 4 (AQPI-14): cart, ancillaries, itemised totals and price revalidation. */
@SpringBootApplication
@EnableConfigurationProperties(CartProperties.class)
public class CartServiceApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(CartServiceApplication.class).properties("spring.config.name=cart-service").run(args);
    }
}


# cart-service/src/main/java/com/hotelbooking/cart/Downstream.java
package com.hotelbooking.cart;

import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import com.hotelbooking.cart.CartApi.OfferItem;
import com.hotelbooking.cart.CartApi.OfferItemValidation;
import com.hotelbooking.cart.CartApi.OfferValidationRequest;
import com.hotelbooking.cart.CartApi.OfferValidationResponse;
import com.hotelbooking.cart.CartApi.Quote;
import com.hotelbooking.cart.CartApi.QuoteRequest;
import com.hotelbooking.cart.CartApi.RoomSelection;
import com.hotelbooking.common.PlatformAutoConfiguration;
import com.hotelbooking.common.resilience.DependencyCalls;
import com.hotelbooking.common.resilience.PlatformProperties;
import com.hotelbooking.common.web.DownstreamErrors;

import reactor.core.publisher.Mono;

/** hotel-service quotes (critical) and offer-service validation (non-critical, story 9.4 AC4). */
@Component
public class Downstream {

    public static final String HOTEL = "hotel-service";
    public static final String OFFER = "offer-service";

    private final WebClient hotel;
    private final WebClient offer;
    private final DependencyCalls calls;

    public Downstream(WebClient.Builder builder, PlatformProperties properties, DependencyCalls calls) {
        this.hotel = PlatformAutoConfiguration.client(builder, properties, HOTEL);
        this.offer = PlatformAutoConfiguration.client(builder, properties, OFFER);
        this.calls = calls;
    }

    public Mono<Quote> quote(String hotelId, QuoteRequest request) {
        return calls.call(HOTEL, true, hotel.post().uri("/api/hotels/{id}/quotes", hotelId).bodyValue(request)
                .retrieve().bodyToMono(Quote.class)).onErrorMap(DownstreamErrors::translate);
    }

    public Mono<List<OfferItemValidation>> validateOffers(RoomSelection room, List<OfferItem> items) {
        CartApi.OfferContext ctx = new CartApi.OfferContext(room.hotelId(), room.destination(), room.checkIn(),
                room.checkOut(), room.roomCode(), room.ratePlanCode(), room.adults(), room.children(), room.currency(),
                room.hotelAmenities(), List.of(), null, null);
        return calls.call(OFFER, true, offer.post().uri("/api/offers/validate")
                .bodyValue(new OfferValidationRequest(ctx, items)).retrieve().bodyToMono(OfferValidationResponse.class))
                .map(OfferValidationResponse::items).onErrorMap(DownstreamErrors::translate);
    }
}


# cart-service/src/main/resources/cart-service.yml
server:
  port: 8084
platform:
  service: cart-service
  environment: local
  dependencies:
    hotel-service:
      base-url: http://localhost:8081
      timeout: 2s
      retries: 1
    offer-service:
      base-url: http://localhost:8083
      timeout: 800ms
      retries: 0
  cart:
    # @rule [AQPI-33] A cart expires 20 minutes after it is created and never creates a reservation itself.
    # @rule [AQPI-17] A price change of more than 1% must be acknowledged by the guest before checkout.
    ttl: 20m
    material-change-percent: 1.0
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics


# hotel-service/src/main/java/com/hotelbooking/hotel/api/HotelApi.java
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

    /** Story 4.2: an applied filter the guest can see and remove. */
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


# hotel-service/src/main/java/com/hotelbooking/hotel/api/HotelController.java
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

    /** Stories 4.1 and 4.2 (AQPI-7, AQPI-8). */
    @GetMapping("/hotels/availability")
    public Mono<AvailabilityPage> availability(@RequestParam String destination,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkIn,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkOut,
            @RequestParam(defaultValue = "1") int rooms, @RequestParam(defaultValue = "2") int adults,
            @RequestParam(defaultValue = "0") int children, @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice, @RequestParam(required = false) String amenities,
            @RequestParam(required = false) Integer minCategory, @RequestParam(required = false) Double maxDistanceKm,
            @RequestParam(defaultValue = "RECOMMENDED") String sort, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Sort order = parseSort(sort);
        List<String> wanted = amenities == null || amenities.isBlank() ? List.of()
                : Arrays.stream(amenities.split(",")).map(String::trim).filter(a -> !a.isEmpty())
                        .map(a -> a.toLowerCase(Locale.ROOT)).toList();
        return Mono.fromSupplier(() -> queries.availability(
                new HotelQueries.Stay(destination, checkIn, checkOut, rooms, adults, children),
                new HotelQueries.Filters(minPrice, maxPrice, wanted, minCategory, maxDistanceKm), order, page, size))
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

    private static Sort parseSort(String value) {
        try {
            return Sort.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_SORT",
                    "Sort by one of: " + Arrays.toString(Sort.values()));
        }
    }
}


# hotel-service/src/main/java/com/hotelbooking/hotel/api/HotelQueries.java
package com.hotelbooking.hotel.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.hotelbooking.common.money.Money;
import com.hotelbooking.common.web.ApiException;
import com.hotelbooking.hotel.api.HotelApi.Availability;
import com.hotelbooking.hotel.api.HotelApi.AvailabilityPage;
import com.hotelbooking.hotel.api.HotelApi.AppliedFilter;
import com.hotelbooking.hotel.api.HotelApi.HotelDetail;
import com.hotelbooking.hotel.api.HotelApi.HotelSummary;
import com.hotelbooking.hotel.api.HotelApi.Quote;
import com.hotelbooking.hotel.api.HotelApi.QuoteRequest;
import com.hotelbooking.hotel.api.HotelApi.RatePlanOption;
import com.hotelbooking.hotel.api.HotelApi.RoomOption;
import com.hotelbooking.hotel.api.HotelApi.Sort;
import com.hotelbooking.hotel.domain.Catalog;
import com.hotelbooking.hotel.domain.Hotel;
import com.hotelbooking.hotel.domain.Inventory;
import com.hotelbooking.hotel.domain.Pricing;
import com.hotelbooking.hotel.domain.RatePlan;
import com.hotelbooking.hotel.domain.Room;

/** Read side of hotel-service: availability lists, details and quotes. */
@Service
public class HotelQueries {

    public static final int LIMITED_THRESHOLD = 2;
    public static final int MAX_PAGE_SIZE = 50;

    public record Stay(String destination, LocalDate checkIn, LocalDate checkOut, int rooms, int adults, int children) {
    }

    public record Filters(BigDecimal minPrice, BigDecimal maxPrice, List<String> amenities,
            Integer minCategory, Double maxDistanceKm) {

        boolean any() {
            return minPrice != null || maxPrice != null || !amenities.isEmpty() || minCategory != null || maxDistanceKm != null;
        }
    }

    private final Catalog catalog;
    private final Inventory inventory;

    public HotelQueries(Catalog catalog, Inventory inventory) {
        this.catalog = catalog;
        this.inventory = inventory;
    }

    public AvailabilityPage availability(Stay stay, Filters filters, Sort sort, int page, int size) {
        requireStay(stay.checkIn(), stay.checkOut(), stay.rooms());
        int pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, size));
        List<HotelSummary> all = catalog.all().stream()
                .filter(h -> h.destination().equalsIgnoreCase(stay.destination()))
                .map(h -> summary(h, stay))
                .toList();
        List<HotelSummary> filtered = all.stream().filter(s -> matches(s, filters)).sorted(order(sort)).toList();
        int from = Math.min(filtered.size(), Math.max(0, page) * pageSize);
        int to = Math.min(filtered.size(), from + pageSize);
        Set<String> amenities = new TreeSet<>();
        all.forEach(s -> amenities.addAll(s.amenities()));
        return new AvailabilityPage(stay.destination().toUpperCase(Locale.ROOT), stay.checkIn(), stay.checkOut(),
                stay.rooms(), stay.adults(), stay.children(), filtered.subList(from, to), Math.max(0, page), pageSize,
                filtered.size(), (filtered.size() + pageSize - 1) / pageSize, all.size(), sort, List.of(Sort.values()),
                applied(filters), filters.any(), List.copyOf(amenities));
    }

    public HotelDetail detail(String hotelId, Stay stay) {
        Hotel hotel = hotel(hotelId);
        requireStay(stay.checkIn(), stay.checkOut(), stay.rooms());
        List<RoomOption> rooms = hotel.rooms().stream().map(room -> {
            int left = inventory.available(hotel.id(), room.code(), stay.checkIn(), stay.checkOut());
            boolean fits = room.fits(stay.rooms(), stay.adults(), stay.children());
            List<RatePlanOption> plans = room.ratePlans().stream().map(plan -> {
                Pricing.Breakdown p = Pricing.price(hotel, plan, stay.checkIn(), stay.checkOut(), stay.rooms());
                return new RatePlanOption(plan.code(), plan.name(), plan.refundable(), plan.breakfastIncluded(),
                        plan.paymentRule(), plan.cancellationTerms(), plan.restrictions(), p.averageNightly(),
                        p.roomCharge(), p.taxes(), p.mandatoryFees(), p.total(), p.priceVersion());
            }).toList();
            return new RoomOption(room.code(), room.name(), room.description(), room.maxAdults(), room.maxChildren(),
                    room.amenities(), left, fits, fits && left >= stay.rooms(), plans);
        }).toList();
        return new HotelDetail(hotel.id(), hotel.name(), hotel.city(), hotel.address(), hotel.distanceKm(),
                hotel.category(), hotel.description(), hotel.images(), hotel.amenities(), hotel.policies(),
                feeDisclosure(hotel), hotel.currency(), rooms);
    }

    public Quote quote(String hotelId, QuoteRequest request) {
        Hotel hotel = hotel(hotelId);
        requireStay(request.checkIn(), request.checkOut(), request.rooms());
        Room room = Optional.ofNullable(hotel.room(request.roomCode())).orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND", "That room type is not offered by this hotel."));
        RatePlan plan = room.ratePlans().stream().filter(p -> p.code().equals(request.ratePlanCode())).findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RATE_PLAN_NOT_FOUND",
                        "That rate plan is not offered for this room."));
        if (!room.fits(request.rooms(), request.adults(), request.children())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "ROOM_OCCUPANCY_EXCEEDED",
                    room.name() + " sleeps up to " + room.maxAdults() + " adults and " + room.maxChildren()
                            + " children per room. Choose another room or add rooms.");
        }
        int left = inventory.available(hotel.id(), room.code(), request.checkIn(), request.checkOut());
        Pricing.Breakdown p = Pricing.price(hotel, plan, request.checkIn(), request.checkOut(), request.rooms());
        boolean available = left >= request.rooms();
        boolean changed = request.expectedPriceVersion() != null && !request.expectedPriceVersion().equals(p.priceVersion());
        String notice = !available ? "This room is no longer available for your dates. Please choose another room or rate."
                : changed ? "The price for this selection has changed since you last saw it. Please review the new total."
                        : null;
        return new Quote(hotel.id(), hotel.name(), hotel.city(), hotel.address(), hotel.policies().checkInFrom(),
                hotel.policies().checkOutUntil(), hotel.destination(), hotel.amenities(), room.code(), room.name(), plan.code(), plan.name(),
                request.checkIn(), request.checkOut(), p.nights(), request.rooms(), request.adults(), request.children(),
                hotel.currency(), p.roomCharge(), p.taxes(), p.mandatoryFees(), p.total(), plan.paymentRule(),
                plan.refundable(), plan.cancellationTerms(), plan.restrictions(), left, available, p.priceVersion(),
                changed, notice);
    }

    private Hotel hotel(String id) {
        return catalog.find(id).orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "HOTEL_NOT_FOUND", "We could not find that hotel."));
    }

    private HotelSummary summary(Hotel hotel, Stay stay) {
        Money bestNightly = null;
        Money bestTotal = null;
        String bestPlan = null;
        String bestRoom = null;
        int maxLeft = 0;
        for (Room room : hotel.rooms()) {
            if (!room.fits(stay.rooms(), stay.adults(), stay.children())) {
                continue;
            }
            int left = inventory.available(hotel.id(), room.code(), stay.checkIn(), stay.checkOut());
            if (left < stay.rooms()) {
                continue;
            }
            maxLeft = Math.max(maxLeft, left);
            for (RatePlan plan : room.ratePlans()) {
                Pricing.Breakdown p = Pricing.price(hotel, plan, stay.checkIn(), stay.checkOut(), stay.rooms());
                if (bestNightly == null || p.averageNightly().amount().compareTo(bestNightly.amount()) < 0) {
                    bestNightly = p.averageNightly();
                    bestTotal = p.total();
                    bestPlan = plan.code();
                    bestRoom = room.code();
                }
            }
        }
        Availability availability = bestNightly == null ? Availability.SOLD_OUT
                : maxLeft <= LIMITED_THRESHOLD ? Availability.LIMITED : Availability.AVAILABLE;
        String qualification = bestNightly == null ? "Not available for your dates and party"
                : "From " + bestNightly.amount().toPlainString() + " " + hotel.currency()
                        + " per room per night before taxes (" + hotel.taxRatePercent().stripTrailingZeros().toPlainString()
                        + "%)" + (feeDisclosure(hotel) == null ? "" : "; " + feeDisclosure(hotel));
        return new HotelSummary(hotel.id(), hotel.name(), hotel.city(), hotel.address(), hotel.distanceKm(),
                hotel.category(), hotel.images().get(0), hotel.amenities(), bestNightly, bestTotal, hotel.currency(),
                availability, availability != Availability.SOLD_OUT, qualification, bestPlan, bestRoom);
    }

    private static String feeDisclosure(Hotel hotel) {
        return hotel.mandatoryFeeLabel() == null ? null
                : hotel.mandatoryFeeLabel() + ": " + hotel.mandatoryFeePerRoomNight().toPlainString() + " "
                        + hotel.currency() + ", payable on top of the room rate";
    }

    private static boolean matches(HotelSummary s, Filters f) {
        if (f.minPrice() != null && (s.startingNightly() == null || s.startingNightly().amount().compareTo(f.minPrice()) < 0)) {
            return false;
        }
        if (f.maxPrice() != null && (s.startingNightly() == null || s.startingNightly().amount().compareTo(f.maxPrice()) > 0)) {
            return false;
        }
        if (f.minCategory() != null && s.category() < f.minCategory()) {
            return false;
        }
        if (f.maxDistanceKm() != null && s.distanceKm() > f.maxDistanceKm()) {
            return false;
        }
        return s.amenities().containsAll(f.amenities());
    }

    private static Comparator<HotelSummary> order(Sort sort) {
        Comparator<HotelSummary> bookableFirst = Comparator.comparing(s -> !s.bookable());
        Comparator<HotelSummary> price = Comparator.comparing(
                s -> s.startingNightly() == null ? BigDecimal.valueOf(Long.MAX_VALUE) : s.startingNightly().amount());
        Comparator<HotelSummary> by = switch (sort) {
            case PRICE_ASC -> price;
            case PRICE_DESC -> price.reversed();
            case DISTANCE -> Comparator.comparingDouble(HotelSummary::distanceKm);
            case CATEGORY -> Comparator.comparingInt(HotelSummary::category).reversed();
            case RECOMMENDED -> Comparator.comparingInt(HotelSummary::category).reversed().thenComparing(price);
        };
        return bookableFirst.thenComparing(by).thenComparing(HotelSummary::hotelId);
    }

    private static List<AppliedFilter> applied(Filters f) {
        List<AppliedFilter> out = new ArrayList<>();
        if (f.minPrice() != null) {
            out.add(new AppliedFilter("minPrice", f.minPrice().toPlainString(), "Remove minPrice"));
        }
        if (f.maxPrice() != null) {
            out.add(new AppliedFilter("maxPrice", f.maxPrice().toPlainString(), "Remove maxPrice"));
        }
        f.amenities().forEach(a -> out.add(new AppliedFilter("amenity", a, "Remove amenity " + a)));
        if (f.minCategory() != null) {
            out.add(new AppliedFilter("minCategory", String.valueOf(f.minCategory()), "Remove minCategory"));
        }
        if (f.maxDistanceKm() != null) {
            out.add(new AppliedFilter("maxDistanceKm", String.valueOf(f.maxDistanceKm()), "Remove maxDistanceKm"));
        }
        return out;
    }

    static void requireStay(LocalDate checkIn, LocalDate checkOut, int rooms) {
        if (checkIn == null || checkOut == null || !checkOut.isAfter(checkIn) || rooms < 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STAY",
                    "Check-out must be after check-in and at least one room is required.");
        }
    }
}


# hotel-service/src/main/java/com/hotelbooking/hotel/domain/Catalog.java
package com.hotelbooking.hotel.domain;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * Deterministic seed catalogue used by the demo and the tests. Three destinations, each with an available,
 * a limited and (in NYC) a sold-out property.
 */
@Component
public class Catalog {

    private final Map<String, Hotel> hotels = new ConcurrentHashMap<>();

    public Catalog() {
        reset();
    }

    public final synchronized void reset() {
        hotels.clear();
        seed().forEach(h -> hotels.put(h.id(), h));
    }

    public Collection<Hotel> all() {
        return hotels.values();
    }

    public Optional<Hotel> find(String id) {
        return Optional.ofNullable(hotels.get(id));
    }

    public boolean knowsDestination(String destination) {
        return hotels.values().stream().anyMatch(h -> h.destination().equalsIgnoreCase(destination));
    }

    /** Demo control: change a nightly rate so price-change behaviour (stories 4.3, 6.1, 6.3) can be shown. */
    public synchronized Optional<RatePlan> setNightly(String hotelId, String roomCode, String rateCode, BigDecimal nightly) {
        Hotel hotel = hotels.get(hotelId);
        if (hotel == null || hotel.room(roomCode) == null) {
            return Optional.empty();
        }
        Map<String, Room> rooms = new LinkedHashMap<>();
        RatePlan[] changed = new RatePlan[1];
        for (Room room : hotel.rooms()) {
            if (!room.code().equals(roomCode)) {
                rooms.put(room.code(), room);
                continue;
            }
            List<RatePlan> plans = room.ratePlans().stream().map(p -> {
                if (!p.code().equals(rateCode)) {
                    return p;
                }
                changed[0] = p.withNightly(nightly);
                return changed[0];
            }).toList();
            rooms.put(room.code(), new Room(room.code(), room.name(), room.description(), room.maxAdults(),
                    room.maxChildren(), room.amenities(), plans));
        }
        if (changed[0] == null) {
            return Optional.empty();
        }
        hotels.put(hotelId, new Hotel(hotel.id(), hotel.name(), hotel.destination(), hotel.city(), hotel.address(),
                hotel.category(), hotel.distanceKm(), hotel.currency(), hotel.description(), hotel.images(),
                hotel.amenities(), hotel.taxRatePercent(), hotel.mandatoryFeePerRoomNight(), hotel.mandatoryFeeLabel(),
                hotel.policies(), List.copyOf(rooms.values())));
        return Optional.of(changed[0]);
    }

    private static List<Hotel> seed() {
        Hotel.Policies city = new Hotel.Policies("15:00", "11:00", "Pets not allowed", "Non-smoking property", "18");
        Hotel.Policies resort = new Hotel.Policies("16:00", "12:00", "Pets up to 10 kg allowed", "Non-smoking property", "21");
        return List.of(
                hotel("H-NYC-001", "Harbor View Hotel", "NYC", "New York", "12 Pier Street", 4, 1.2, "USD", "18.875", "25.00", city,
                        List.of("wifi", "gym", "restaurant", "parking"), "195.00"),
                hotel("H-NYC-002", "Midtown Budget Inn", "NYC", "New York", "400 W 40th Street", 2, 0.6, "USD", "18.875", "0.00", city,
                        List.of("wifi"), "119.00"),
                hotel("H-NYC-003", "Central Park Grand", "NYC", "New York", "1 Park Avenue", 5, 2.4, "USD", "18.875", "35.00", city,
                        List.of("wifi", "gym", "spa", "pool", "restaurant"), "420.00"),
                hotel("H-NYC-004", "Brooklyn Loft Suites", "NYC", "New York", "88 Kent Avenue", 3, 6.8, "USD", "18.875", "15.00", city,
                        List.of("wifi", "kitchen", "parking"), "165.00"),
                hotel("H-LON-001", "Thames Riverside Hotel", "LON", "London", "5 Embankment", 4, 0.9, "GBP", "20.00", "0.00", city,
                        List.of("wifi", "restaurant", "gym"), "210.00"),
                hotel("H-LON-002", "Camden Courtyard", "LON", "London", "22 Camden High Street", 3, 4.1, "GBP", "20.00", "0.00", city,
                        List.of("wifi", "parking"), "140.00"),
                hotel("H-PAR-001", "Hotel Lumiere", "PAR", "Paris", "9 Rue de Rivoli", 4, 0.5, "EUR", "10.00", "3.50", resort,
                        List.of("wifi", "restaurant", "spa"), "230.00"),
                hotel("H-PAR-002", "Montmartre Maison", "PAR", "Paris", "41 Rue Lepic", 3, 3.2, "EUR", "10.00", "2.00", city,
                        List.of("wifi"), "150.00"));
    }

    private static Hotel hotel(String id, String name, String destination, String city, String address, int category,
            double distanceKm, String currency, String taxRate, String fee, Hotel.Policies policies, List<String> amenities,
            String baseNightly) {
        BigDecimal base = new BigDecimal(baseNightly);
        String terms = "Free cancellation until 48 hours before check-in; after that the booking can no longer be cancelled.";
        List<RatePlan> standardPlans = List.of(
                new RatePlan("FLEX", "Flexible – pay at hotel", base, true, false, PaymentRule.PAY_AT_HOTEL, terms,
                        "Card guarantee required"),
                new RatePlan("SAVER", "Advance saver – pay now", base.multiply(new BigDecimal("0.85")), false, false,
                        PaymentRule.PAY_NOW, "Non-refundable. Changes are not permitted.", "Full prepayment at booking"),
                new RatePlan("BB", "Bed and breakfast", base.add(new BigDecimal("30")), true, true, PaymentRule.PAY_AT_HOTEL,
                        terms, "Breakfast for registered guests only"));
        List<RatePlan> suitePlans = standardPlans.stream()
                .map(p -> p.withNightly(p.nightly().multiply(new BigDecimal("1.6")))).toList();
        List<Room> rooms = List.of(
                new Room("STD-K", "Standard King", "One king bed, city view, 25 m²", 2, 1, List.of("wifi", "tv", "desk"), standardPlans),
                new Room("STD-TT", "Standard Twin", "Two twin beds, 24 m²", 2, 2, List.of("wifi", "tv"), standardPlans),
                new Room("STE-F", "Family Suite", "Separate living room, sleeps 4, 45 m²", 4, 3, List.of("wifi", "tv", "sofa-bed", "minibar"),
                        suitePlans));
        return new Hotel(id, name, destination, city, address, category, distanceKm, currency,
                name + " in " + city + ", " + category + "-star, " + distanceKm + " km from the centre.",
                List.of("https://img.example.test/" + id + "/exterior.jpg", "https://img.example.test/" + id + "/room.jpg"),
                amenities, new BigDecimal(taxRate), new BigDecimal(fee),
                new BigDecimal(fee).signum() == 0 ? null : "Destination fee per room per night", policies, rooms);
    }
}


# hotel-service/src/main/java/com/hotelbooking/hotel/domain/Hotel.java
package com.hotelbooking.hotel.domain;

import java.math.BigDecimal;
import java.util.List;

public record Hotel(String id, String name, String destination, String city, String address, int category,
        double distanceKm, String currency, String description, List<String> images, List<String> amenities,
        BigDecimal taxRatePercent, BigDecimal mandatoryFeePerRoomNight, String mandatoryFeeLabel, Policies policies,
        List<Room> rooms) {

    public record Policies(String checkInFrom, String checkOutUntil, String pets, String smoking, String minimumAge) {
    }

    public Room room(String code) {
        return rooms.stream().filter(r -> r.code().equals(code)).findFirst().orElse(null);
    }
}


# hotel-service/src/main/java/com/hotelbooking/hotel/domain/Inventory.java
package com.hotelbooking.hotel.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * Room inventory by hotel, room type and night. Only reservation-service commits inventory (a cart never does,
 * story 6.1 BR). Commitments are keyed by reservation reference so repeats and releases are idempotent (story 7.3).
 */
@Component
public class Inventory {

    public static final int DEFAULT_ROOMS = 8;

    public record Commitment(String reference, String hotelId, String roomCode, LocalDate checkIn, LocalDate checkOut, int rooms) {
    }

    private final Map<String, Integer> capacity = new ConcurrentHashMap<>();
    private final Map<String, Commitment> commitments = new ConcurrentHashMap<>();

    public Inventory() {
        reset();
    }

    public final synchronized void reset() {
        capacity.clear();
        commitments.clear();
        capacity.put(key("H-NYC-003", "*"), 0);
        capacity.put(key("H-NYC-002", "*"), 2);
        capacity.put(key("H-LON-002", "STE-F"), 0);
    }

    public synchronized void setCapacity(String hotelId, String roomCode, int rooms) {
        capacity.put(key(hotelId, roomCode == null ? "*" : roomCode), Math.max(0, rooms));
    }

    /** Fewest rooms left on any night of the stay. */
    public synchronized int available(String hotelId, String roomCode, LocalDate checkIn, LocalDate checkOut) {
        int base = capacity.getOrDefault(key(hotelId, roomCode),
                capacity.getOrDefault(key(hotelId, "*"), DEFAULT_ROOMS));
        int min = base;
        for (LocalDate night = checkIn; night.isBefore(checkOut); night = night.plusDays(1)) {
            LocalDate n = night;
            int used = commitments.values().stream()
                    .filter(c -> c.hotelId().equals(hotelId) && c.roomCode().equals(roomCode)
                            && !n.isBefore(c.checkIn()) && n.isBefore(c.checkOut()))
                    .mapToInt(Commitment::rooms).sum();
            min = Math.min(min, base - used);
        }
        return Math.max(0, min);
    }

    /** Returns empty when inventory is insufficient; repeating the same reference returns the original commitment. */
    public synchronized Optional<Commitment> commit(Commitment request) {
        Commitment existing = commitments.get(request.reference());
        if (existing != null) {
            return Optional.of(existing);
        }
        if (available(request.hotelId(), request.roomCode(), request.checkIn(), request.checkOut()) < request.rooms()) {
            return Optional.empty();
        }
        commitments.put(request.reference(), request);
        return Optional.of(request);
    }

    public synchronized boolean release(String reference) {
        return commitments.remove(reference) != null;
    }

    public List<Commitment> commitments() {
        return List.copyOf(commitments.values());
    }

    private static String key(String hotelId, String roomCode) {
        return hotelId + "|" + roomCode;
    }
}


# hotel-service/src/main/java/com/hotelbooking/hotel/domain/PaymentRule.java
package com.hotelbooking.hotel.domain;

/** Payment requirement attached to a rate plan (story 7.2 BR: payment depends on rate conditions). */
public enum PaymentRule {
    PAY_NOW,
    PAY_AT_HOTEL
}


# hotel-service/src/main/java/com/hotelbooking/hotel/domain/Pricing.java
package com.hotelbooking.hotel.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import com.hotelbooking.common.money.Money;
import com.hotelbooking.common.privacy.Masking;

/** Stay pricing: weekend nights (Fri, Sat) +15 %, tax on room charge, mandatory fee per room-night. */
public final class Pricing {

    public static final BigDecimal WEEKEND_UPLIFT = new BigDecimal("1.15");

    public record Breakdown(Money roomCharge, Money taxes, Money mandatoryFees, Money total, Money averageNightly,
            long nights, String priceVersion) {
    }

    private Pricing() {
    }

    public static Breakdown price(Hotel hotel, RatePlan plan, LocalDate checkIn, LocalDate checkOut, int rooms) {
        long nights = ChronoUnit.DAYS.between(checkIn, checkOut);
        Money room = Money.zero(hotel.currency());
        for (LocalDate night = checkIn; night.isBefore(checkOut); night = night.plusDays(1)) {
            BigDecimal nightly = weekend(night) ? plan.nightly().multiply(WEEKEND_UPLIFT) : plan.nightly();
            room = room.plus(new Money(nightly, hotel.currency()).times(rooms));
        }
        Money taxes = room.percent(hotel.taxRatePercent());
        Money fees = new Money(hotel.mandatoryFeePerRoomNight(), hotel.currency()).times(nights * rooms);
        Money total = room.plus(taxes).plus(fees);
        Money average = new Money(room.amount().divide(BigDecimal.valueOf(Math.max(1, nights * rooms)), 2,
                RoundingMode.HALF_UP), hotel.currency());
        String version = Masking.fingerprint(hotel.id(), plan.code(), checkIn.toString(), checkOut.toString(),
                String.valueOf(rooms), total.amount().toPlainString()).substring(0, 16);
        return new Breakdown(room, taxes, fees, total, average, nights, version);
    }

    private static boolean weekend(LocalDate night) {
        return night.getDayOfWeek() == DayOfWeek.FRIDAY || night.getDayOfWeek() == DayOfWeek.SATURDAY;
    }
}


# hotel-service/src/main/java/com/hotelbooking/hotel/domain/RatePlan.java
package com.hotelbooking.hotel.domain;

import java.math.BigDecimal;

public record RatePlan(String code, String name, BigDecimal nightly, boolean refundable, boolean breakfastIncluded,
        PaymentRule paymentRule, String cancellationTerms, String restrictions) {

    public RatePlan withNightly(BigDecimal value) {
        return new RatePlan(code, name, value, refundable, breakfastIncluded, paymentRule, cancellationTerms, restrictions);
    }
}


# hotel-service/src/main/java/com/hotelbooking/hotel/domain/Room.java
package com.hotelbooking.hotel.domain;

import java.util.List;

public record Room(String code, String name, String description, int maxAdults, int maxChildren, List<String> amenities,
        List<RatePlan> ratePlans) {

    public boolean fits(int rooms, int adults, int children) {
        return ceilDiv(adults, rooms) <= maxAdults && ceilDiv(children, rooms) <= maxChildren;
    }

    private static int ceilDiv(int value, int by) {
        return (value + by - 1) / by;
    }
}


# hotel-service/src/main/java/com/hotelbooking/hotel/HotelServiceApplication.java
package com.hotelbooking.hotel;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;

/** Epic 2 (AQPI-6): hotel content, availability, rates, inventory and quotes. */
@SpringBootApplication
public class HotelServiceApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(HotelServiceApplication.class).properties("spring.config.name=hotel-service").run(args);
    }
}


# hotel-service/src/main/resources/hotel-service.yml
server:
  port: 8081
platform:
  service: hotel-service
  environment: local
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics


# journey-tests/src/test/java/com/hotelbooking/journey/BookingJourneyTest.java
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
    @DisplayName("AQPI-3 AQPI-7 AQPI-9 AQPI-11 AQPI-15 AQPI-16 AQPI-19 AQPI-20 AQPI-21 AQPI-22 AQPI-24 AQPI-25 AQPI-29: search to confirmed booking and e-mail")
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
    @DisplayName("AQPI-8: sorting by an unsupported option is refused with the approved options, not a server error")
    void unsupportedSortRefused() {
        JsonNode search = post("search-service", "/api/searches", Map.of("destination", "NYC", "checkIn", CHECK_IN,
                "checkOut", CHECK_OUT, "rooms", 1, "adults", 2, "children", 0), HttpStatus.OK);
        JsonNode error = platform.client("search-service").get()
                .uri("/api/searches/" + search.path("searchId").asText() + "/results?sort=NAME").exchange()
                .expectStatus().isBadRequest().expectBody(JsonNode.class).returnResult().getResponseBody();
        assertThat(error.path("code").asText()).isEqualTo("UNSUPPORTED_SORT");
        assertThat(error.path("message").asText()).contains("PRICE_ASC");
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
    @DisplayName("AQPI-20 AQPI-22: a declined pay-now card books nothing and holds no inventory")
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
    @DisplayName("AQPI-21 AQPI-22: a lost payment response is shown as pending and reconciled without a second charge")
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
    @DisplayName("AQPI-26 AQPI-35: resend answers generically and is limited to 5 per booking")
    void resendConfirmation() {
        String cartId = createCart("H-NYC-001", "STD-K", "FLEX").path("cartId").asText();
        JsonNode booked = reserve("journey-" + UUID.randomUUID(), cartId, "tok_visa_ok", "jane@example.com", null,
                HttpStatus.CREATED);
        String number = booked.path("confirmationNumber").asText();
        String good = resend(number, "Doe", HttpStatus.ACCEPTED).path("message").asText();
        String wrong = resend(number, "Smith", HttpStatus.ACCEPTED).path("message").asText();
        assertThat(wrong).isEqualTo(good);
        for (int i = 2; i <= 5; i++) {
            resend(number, "Doe", HttpStatus.ACCEPTED);
        }
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

    @Test
    @DisplayName("AQPI-36: a flexible booking is cancelled free of charge, its payment hold voided and its room released")
    void freeCancellation() {
        String cartId = createCart("H-NYC-001", "STD-K", "FLEX").path("cartId").asText();
        String id = reserve("journey-" + UUID.randomUUID(), cartId, "tok_visa_ok", "jane@example.com", null,
                HttpStatus.CREATED).path("reservationId").asText();
        JsonNode cancelled = post("reservation-service", "/api/reservations/" + id + "/cancel", Map.of(), HttpStatus.OK);
        assertThat(cancelled.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(cancelled.path("paymentStatus").asText()).isEqualTo("VOIDED");
        assertThat(get("reservation-service", "/api/ops/payments").get(0).path("voided").asBoolean()).isTrue();
        assertThat(get("hotel-service", "/api/inventory/commitments").size()).isZero();
        assertThat(reconciliationConsistent()).isTrue();
    }

    @Test
    @DisplayName("AQPI-36: a cancellation inside 48 hours of check-in is refused and the booking stays confirmed")
    void lateCancellationRefused() {
        LocalDate tomorrow = LocalDate.now(java.time.ZoneOffset.UTC).plusDays(1);
        String cartId = post("cart-service", "/api/carts", Map.of("hotelId", "H-NYC-001", "roomCode", "STD-K",
                "ratePlanCode", "FLEX", "checkIn", tomorrow, "checkOut", tomorrow.plusDays(2), "rooms", 1, "adults", 2,
                "children", 0), HttpStatus.CREATED).path("cartId").asText();
        String id = reserve("journey-" + UUID.randomUUID(), cartId, "tok_visa_ok", "jane@example.com", null,
                HttpStatus.CREATED).path("reservationId").asText();
        JsonNode refused = post("reservation-service", "/api/reservations/" + id + "/cancel", Map.of(), HttpStatus.CONFLICT);
        assertThat(refused.path("code").asText()).isEqualTo("FREE_CANCELLATION_CLOSED");
        assertThat(get("reservation-service", "/api/reservations/" + id).path("status").asText()).isEqualTo("CONFIRMED");
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


# journey-tests/src/test/java/com/hotelbooking/journey/Platform.java
package com.hotelbooking.journey;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.test.web.reactive.server.WebTestClient;

import com.hotelbooking.cart.CartServiceApplication;
import com.hotelbooking.common.events.BusinessEvent;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.hotel.HotelServiceApplication;
import com.hotelbooking.notification.NotificationServiceApplication;
import com.hotelbooking.offer.OfferServiceApplication;
import com.hotelbooking.reservation.ReservationServiceApplication;
import com.hotelbooking.search.SearchServiceApplication;

/** Starts the six services in one JVM on random ports, wired to each other as in a real deployment. */
final class Platform implements AutoCloseable {

    private final Map<String, ConfigurableApplicationContext> contexts = new LinkedHashMap<>();
    private final Map<String, Integer> ports = new LinkedHashMap<>();

    Platform() {
        start("hotel-service", HotelServiceApplication.class);
        start("offer-service", OfferServiceApplication.class);
        start("notification-service", NotificationServiceApplication.class);
        start("search-service", SearchServiceApplication.class, "hotel-service");
        start("cart-service", CartServiceApplication.class, "hotel-service", "offer-service");
        start("reservation-service", ReservationServiceApplication.class, "cart-service", "hotel-service",
                "notification-service");
    }

    private void start(String name, Class<?> app, String... dependencies) {
        List<String> props = new ArrayList<>(List.of("spring.config.name=" + name, "server.port=0",
                "spring.main.banner-mode=off"));
        for (String dep : dependencies) {
            props.add("platform.dependencies." + dep + ".base-url=http://localhost:" + ports.get(dep));
        }
        ConfigurableApplicationContext ctx = new SpringApplicationBuilder(app).properties(props.toArray(String[]::new))
                .run();
        contexts.put(name, ctx);
        ports.put(name, Integer.valueOf(ctx.getEnvironment().getProperty("local.server.port")));
    }

    WebTestClient client(String service) {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + ports.get(service))
                .responseTimeout(Duration.ofSeconds(20)).build();
    }

    List<BusinessEvent> events(String service) {
        return contexts.get(service).getBean(EventPublisher.class).recent();
    }

    void reset() {
        for (String service : contexts.keySet()) {
            if (!service.equals("search-service")) {
                client(service).post().uri("/api/admin/reset").exchange().expectStatus().is2xxSuccessful();
            }
        }
    }

    @Override
    public void close() {
        List<ConfigurableApplicationContext> all = new ArrayList<>(contexts.values());
        Collections.reverse(all);
        all.forEach(ConfigurableApplicationContext::close);
    }
}


# notification-service/src/main/java/com/hotelbooking/notification/EmailProvider.java
package com.hotelbooking.notification;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.stereotype.Component;

/**
 * Simulated e-mail provider. Recipients at {@code fail.test} always fail, {@code flaky.test} fail on the first
 * attempt, and {@code bounce.test} are accepted but later bounce.
 */
@Component
public class EmailProvider {

    public static class ProviderException extends RuntimeException {
        public ProviderException() {
            super("provider rejected the send");
        }
    }

    private final Map<String, AtomicInteger> attemptsByRecipient = new ConcurrentHashMap<>();
    private final AtomicInteger accepted = new AtomicInteger();

    public String send(String recipient, String subject, String html, String text) {
        String domain = recipient.substring(recipient.indexOf('@') + 1);
        int attempt = attemptsByRecipient.computeIfAbsent(recipient, k -> new AtomicInteger()).incrementAndGet();
        if (domain.equals("fail.test") || (domain.equals("flaky.test") && attempt == 1)) {
            throw new ProviderException();
        }
        accepted.incrementAndGet();
        return "pm-" + UUID.randomUUID();
    }

    public boolean willBounce(String recipient) {
        return recipient.endsWith("@bounce.test");
    }

    public int acceptedCount() {
        return accepted.get();
    }

    public void reset() {
        attemptsByRecipient.clear();
        accepted.set(0);
    }
}


# notification-service/src/main/java/com/hotelbooking/notification/NotificationApi.java
package com.hotelbooking.notification;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.common.money.Money;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Request and response shapes for notification-service. */
public final class NotificationApi {

    private NotificationApi() {
    }

    public enum DeliveryStatus {
        QUEUED,
        SENT,
        DELIVERED,
        BOUNCED,
        FAILED
    }

    public enum Kind {
        CONFIRMATION,
        RESEND,
        CANCELLATION
    }

    public record HotelInfo(@NotBlank String name, String address, String city, String checkInFrom, String checkOutUntil) {
    }

    public record Item(@NotBlank String label, int quantity, @NotNull Money amount) {
    }

    /** Only the personal data the message needs (story 8.1 BR); no payment details. */
    public record ConfirmationRequest(@NotBlank String reservationId, @NotBlank String confirmationNumber,
            @NotBlank String status, String locale, @NotBlank String guestFirstName, @NotBlank String guestLastName,
            @NotBlank @Email String guestEmail, @NotNull @Valid HotelInfo hotel, @NotNull LocalDate checkIn,
            @NotNull LocalDate checkOut, long nights, int rooms, int adults, int children, String roomName,
            String ratePlanName, List<@Valid Item> items, @NotNull Money total, String paymentRule,
            String cancellationTerms, Boolean refundable) {
    }

    public record StatusChange(DeliveryStatus status, Instant at, String detail) {
    }

    public record MessageView(String messageId, String reservationId, String confirmationNumber, Kind kind,
            String locale, String templateVersion, String recipient, DeliveryStatus status, int attempts,
            List<StatusChange> history, String subject, String html, String text, Instant createdAt) {
    }

    public record ResendRequest(@NotBlank String confirmationNumber, @NotBlank String lastName) {
    }

    public record ResendResponse(String message) {
    }

    public record Webhook(@NotBlank String providerMessageId, @NotNull DeliveryStatus event) {
    }
}


# notification-service/src/main/java/com/hotelbooking/notification/NotificationController.java
package com.hotelbooking.notification;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.hotelbooking.common.events.EventNames;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.web.ApiException;
import com.hotelbooking.notification.NotificationApi.ConfirmationRequest;
import com.hotelbooking.notification.NotificationApi.MessageView;
import com.hotelbooking.notification.NotificationApi.ResendRequest;
import com.hotelbooking.notification.NotificationApi.ResendResponse;
import com.hotelbooking.notification.NotificationApi.Webhook;

import jakarta.validation.Valid;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api")
public class NotificationController {

    public static final String ROLE_HEADER = "X-Operator-Role";
    public static final String CLIENT_HEADER = "X-Client-Id";
    /** Only this operational role sees full e-mail addresses (story 8.2 BR). */
    public static final String EMAIL_OPS = "EMAIL_OPS";

    private final NotificationService notifications;
    private final EventPublisher events;

    public NotificationController(NotificationService notifications, EventPublisher events) {
        this.notifications = notifications;
        this.events = events;
    }

    /** Stories 8.1, 8.2. */
    @PostMapping("/confirmations")
    public Mono<ResponseEntity<MessageView>> confirm(@Valid @RequestBody ConfirmationRequest request) {
        return notifications.confirm(request).map(c -> ResponseEntity
                .status(c.created() ? HttpStatus.CREATED : HttpStatus.OK).body(c.view()));
    }

    /** Story 8.4. */
    @PostMapping("/cancellations")
    public Mono<ResponseEntity<MessageView>> cancellation(@Valid @RequestBody ConfirmationRequest request) {
        return notifications.cancellation(request).map(c -> ResponseEntity
                .status(c.created() ? HttpStatus.CREATED : HttpStatus.OK).body(c.view()));
    }

    @GetMapping("/confirmations/{reservationId}")
    public Mono<MessageView> forReservation(@PathVariable String reservationId) {
        return Mono.fromSupplier(() -> notifications.forReservation(reservationId).orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "MESSAGE_NOT_FOUND", "No confirmation for that reservation.")));
    }

    /** Story 8.3. */
    @PostMapping("/confirmations/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Mono<ResendResponse> resend(@Valid @RequestBody ResendRequest request,
            @RequestHeader(value = CLIENT_HEADER, required = false) String clientId) {
        return notifications.resend(request.confirmationNumber(), request.lastName(), clientId).map(ResendResponse::new);
    }

    @PostMapping("/provider/webhooks")
    public Mono<MessageView> webhook(@Valid @RequestBody Webhook webhook) {
        return notifications.webhook(webhook.providerMessageId(), webhook.event());
    }

    /** Story 8.2 AC4: operations view of delivery states; masked unless EMAIL_OPS, always audited. */
    @GetMapping("/ops/messages")
    public Mono<List<MessageView>> messages(@RequestParam(required = false) String reservationId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) {
        if (role == null || role.isBlank()) {
            return Mono.error(new ApiException(HttpStatus.FORBIDDEN, "OPERATOR_ROLE_REQUIRED",
                    "An operator role is required to view messages."));
        }
        boolean unmasked = EMAIL_OPS.equals(role);
        return events.event(EventNames.AUDIT_ACCESS).attr("resource", "messages").attr("role", role)
                .attr("unmasked", unmasked).attr("reservationId", reservationId).publish()
                .then(Mono.fromSupplier(() -> notifications.list(reservationId, unmasked)));
    }

    @PostMapping("/ops/messages/{messageId}/retry")
    public Mono<MessageView> retry(@PathVariable String messageId) {
        return notifications.retry(messageId);
    }

    @PostMapping("/admin/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> reset() {
        return Mono.fromRunnable(notifications::reset);
    }
}


# notification-service/src/main/java/com/hotelbooking/notification/NotificationProperties.java
package com.hotelbooking.notification;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("platform.notification")
public class NotificationProperties {

    private int maxSendAttempts = 3;
    private int maxManualRetries = 3;
    private Duration freeCancellationWindow = Duration.ofHours(48);
    private int resendLimitPerBooking = 5;
    private Duration resendBookingWindow = Duration.ofHours(24);
    private int resendLimitPerClient = 10;
    private Duration resendClientWindow = Duration.ofHours(1);
    private boolean simulateDelivery = true;
    private String templateVersion = "confirmation-v2";
    private List<String> locales = List.of("en-GB", "en-US", "fr-FR", "es-ES");

    public int getMaxSendAttempts() {
        return maxSendAttempts;
    }

    public void setMaxSendAttempts(int maxSendAttempts) {
        this.maxSendAttempts = maxSendAttempts;
    }

    public int getMaxManualRetries() {
        return maxManualRetries;
    }

    public void setMaxManualRetries(int maxManualRetries) {
        this.maxManualRetries = maxManualRetries;
    }

    public int getResendLimitPerBooking() {
        return resendLimitPerBooking;
    }

    public void setResendLimitPerBooking(int resendLimitPerBooking) {
        this.resendLimitPerBooking = resendLimitPerBooking;
    }

    public Duration getResendBookingWindow() {
        return resendBookingWindow;
    }

    public void setResendBookingWindow(Duration resendBookingWindow) {
        this.resendBookingWindow = resendBookingWindow;
    }

    public int getResendLimitPerClient() {
        return resendLimitPerClient;
    }

    public void setResendLimitPerClient(int resendLimitPerClient) {
        this.resendLimitPerClient = resendLimitPerClient;
    }

    public Duration getResendClientWindow() {
        return resendClientWindow;
    }

    public void setResendClientWindow(Duration resendClientWindow) {
        this.resendClientWindow = resendClientWindow;
    }

    public boolean isSimulateDelivery() {
        return simulateDelivery;
    }

    public void setSimulateDelivery(boolean simulateDelivery) {
        this.simulateDelivery = simulateDelivery;
    }

    public String getTemplateVersion() {
        return templateVersion;
    }

    public void setTemplateVersion(String templateVersion) {
        this.templateVersion = templateVersion;
    }

    public List<String> getLocales() {
        return locales;
    }

    public void setLocales(List<String> locales) {
        this.locales = locales;
    }

    public Duration getFreeCancellationWindow() {
        return freeCancellationWindow;
    }

    public void setFreeCancellationWindow(Duration freeCancellationWindow) {
        this.freeCancellationWindow = freeCancellationWindow;
    }
}


# notification-service/src/main/java/com/hotelbooking/notification/NotificationService.java
package com.hotelbooking.notification;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.hotelbooking.common.events.EventNames;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.privacy.FieldCipher;
import com.hotelbooking.common.privacy.Masking;
import com.hotelbooking.common.web.ApiException;
import com.hotelbooking.notification.NotificationApi.ConfirmationRequest;
import com.hotelbooking.notification.NotificationApi.DeliveryStatus;
import com.hotelbooking.notification.NotificationApi.Kind;
import com.hotelbooking.notification.NotificationApi.MessageView;
import com.hotelbooking.notification.NotificationApi.StatusChange;

import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.util.retry.Retry;

/** Stories 8.1, 8.2, 8.3, 8.4 (AQPI-24, AQPI-25, AQPI-26, AQPI-37). */
@Service
public class NotificationService {

    public static final String GENERIC_RESEND = "If the details match a confirmed booking, we have sent the confirmation to the e-mail address on the booking.";

    static final class Message {
        final String id;
        final String reservationId;
        final String confirmationNumber;
        final Kind kind;
        final String locale;
        final String templateVersion;
        final String recipientSealed;
        final String recipientMasked;
        final String subject;
        final String html;
        final String text;
        final Instant createdAt;
        final List<StatusChange> history = new ArrayList<>();
        DeliveryStatus status = DeliveryStatus.QUEUED;
        int attempts;
        int manualRetries;
        String providerMessageId;

        Message(String id, String reservationId, String confirmationNumber, Kind kind, String locale, String templateVersion,
                String recipientSealed, String recipientMasked, TemplateRenderer.Rendered content, Instant createdAt) {
            this.id = id;
            this.reservationId = reservationId;
            this.confirmationNumber = confirmationNumber;
            this.kind = kind;
            this.locale = locale;
            this.templateVersion = templateVersion;
            this.recipientSealed = recipientSealed;
            this.recipientMasked = recipientMasked;
            this.subject = content.subject();
            this.html = content.html();
            this.text = content.text();
            this.createdAt = createdAt;
        }
    }

    record Booking(String reservationId, String lastNameFingerprint, ConfirmationRequest sealedRequest) {
    }

    private final Map<String, Message> messages = new ConcurrentHashMap<>();
    private final Map<String, String> confirmationByReservation = new ConcurrentHashMap<>();
    private final Map<String, String> cancellationByReservation = new ConcurrentHashMap<>();
    private final Map<String, Booking> bookings = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> resendsByBooking = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> resendsByClient = new ConcurrentHashMap<>();
    private final TemplateRenderer renderer;
    private final EmailProvider provider;
    private final FieldCipher cipher;
    private final NotificationProperties properties;
    private final EventPublisher events;
    private final Clock clock;

    public NotificationService(TemplateRenderer renderer, EmailProvider provider, FieldCipher cipher,
            NotificationProperties properties, EventPublisher events, Clock clock) {
        this.renderer = renderer;
        this.provider = provider;
        this.cipher = cipher;
        this.properties = properties;
        this.events = events;
        this.clock = clock;
    }

    public record Created(MessageView view, boolean created) {
    }

    /** One confirmation per reservation; repeats return the original (story 8.2 AC1). */
    public Mono<Created> confirm(ConfirmationRequest r) {
        if (!"CONFIRMED".equals(r.status())) {
            return Mono.error(new ApiException(HttpStatus.CONFLICT, "RESERVATION_NOT_CONFIRMED",
                    "A confirmation can only be sent for a confirmed reservation."));
        }
        Message message;
        boolean created;
        synchronized (this) {
            String existing = confirmationByReservation.get(r.reservationId());
            if (existing != null) {
                message = messages.get(existing);
                created = false;
            } else {
                ConfirmationRequest sealed = seal(r);
                bookings.put(r.confirmationNumber().toUpperCase(Locale.ROOT),
                        new Booking(r.reservationId(), Masking.fingerprint(r.guestLastName()), sealed));
                message = newMessage(r, Kind.CONFIRMATION);
                confirmationByReservation.put(r.reservationId(), message.id);
                created = true;
            }
        }
        Mono<Void> send = created ? deliver(message, r.guestEmail()) : Mono.empty();
        return send.then(events.event(EventNames.CONFIRMATION_GENERATED).attr("reservationId", r.reservationId())
                .attr("templateVersion", message.templateVersion).attr("locale", message.locale)
                .attr("created", created).publish())
                .then(Mono.fromSupplier(() -> new Created(view(message, false), created)));
    }

    /** Story 8.4: one cancellation e-mail per cancelled reservation; repeats return the original. */
    public Mono<Created> cancellation(ConfirmationRequest r) {
        if (!"CANCELLED".equals(r.status())) {
            return Mono.error(new ApiException(HttpStatus.CONFLICT, "RESERVATION_NOT_CANCELLED",
                    "A cancellation e-mail can only be sent for a cancelled reservation."));
        }
        Message message;
        boolean created;
        synchronized (this) {
            String existing = cancellationByReservation.get(r.reservationId());
            created = existing == null;
            message = created ? newMessage(r, Kind.CANCELLATION) : messages.get(existing);
            cancellationByReservation.putIfAbsent(r.reservationId(), message.id);
        }
        Mono<Void> send = created ? deliver(message, r.guestEmail()) : Mono.empty();
        return send.then(Mono.fromSupplier(() -> new Created(view(message, false), created)));
    }

    /** Story 8.3: verify without revealing anything, rate-limit, then send a new message event. */
    public Mono<String> resend(String confirmationNumber, String lastName, String clientId) {
        Instant now = clock.instant();
        String client = clientId == null || clientId.isBlank() ? "anonymous" : clientId;
        if (!allow(resendsByClient, client, properties.getResendLimitPerClient(), properties.getResendClientWindow(), now)) {
            return events.event(EventNames.RESEND_REQUESTED).outcome("rate_limited_client").publish()
                    .then(Mono.error(tooMany()));
        }
        Booking booking = bookings.get(confirmationNumber.trim().toUpperCase(Locale.ROOT));
        if (booking == null || !booking.lastNameFingerprint().equals(Masking.fingerprint(lastName))) {
            return events.event(EventNames.RESEND_REQUESTED).outcome("not_verified").publish().thenReturn(GENERIC_RESEND);
        }
        if (!allow(resendsByBooking, booking.reservationId(), properties.getResendLimitPerBooking(),
                properties.getResendBookingWindow(), now)) {
            return events.event(EventNames.RESEND_REQUESTED).outcome("rate_limited_booking")
                    .attr("reservationId", booking.reservationId()).publish().then(Mono.error(tooMany()));
        }
        ConfirmationRequest r = unseal(booking.sealedRequest());
        Message message = newMessage(r, Kind.RESEND);
        return deliver(message, r.guestEmail())
                .then(events.event(EventNames.RESEND_REQUESTED).outcome("sent").attr("reservationId", booking.reservationId())
                        .attr("messageId", message.id).publish())
                .thenReturn(GENERIC_RESEND);
    }

    public Mono<MessageView> webhook(String providerMessageId, DeliveryStatus event) {
        Message message = messages.values().stream().filter(m -> providerMessageId.equals(m.providerMessageId)).findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MESSAGE_NOT_FOUND", "Unknown provider message."));
        transition(message, event, "provider webhook");
        return emailStatus(message).thenReturn(view(message, false));
    }

    /** Ops retry for a FAILED message, capped so guests are not spammed (story 8.2 AC3). */
    public Mono<MessageView> retry(String messageId) {
        Message message = Optional.ofNullable(messages.get(messageId)).orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "MESSAGE_NOT_FOUND", "Unknown message."));
        synchronized (message) {
            if (message.status != DeliveryStatus.FAILED) {
                throw new ApiException(HttpStatus.CONFLICT, "RETRY_NOT_ALLOWED", "Only failed messages can be retried.");
            }
            if (message.manualRetries >= properties.getMaxManualRetries()) {
                throw new ApiException(HttpStatus.CONFLICT, "RETRY_LIMIT_REACHED", "This message has reached its retry limit.");
            }
            message.manualRetries++;
        }
        return deliver(message, cipher.decrypt(message.recipientSealed)).thenReturn(view(message, false));
    }

    public List<MessageView> list(String reservationId, boolean unmasked) {
        return messages.values().stream()
                .filter(m -> reservationId == null || reservationId.equals(m.reservationId))
                .sorted((a, b) -> a.createdAt.compareTo(b.createdAt))
                .map(m -> view(m, unmasked)).toList();
    }

    public Optional<MessageView> forReservation(String reservationId) {
        return Optional.ofNullable(confirmationByReservation.get(reservationId)).map(messages::get).map(m -> view(m, false));
    }

    public void reset() {
        messages.clear();
        confirmationByReservation.clear();
        cancellationByReservation.clear();
        bookings.clear();
        resendsByBooking.clear();
        resendsByClient.clear();
        provider.reset();
    }

    private Message newMessage(ConfirmationRequest r, Kind kind) {
        TemplateRenderer.Rendered content = kind == Kind.CANCELLATION ? renderer.renderCancellation(r) : renderer.render(r);
        Message message = new Message("M-" + UUID.randomUUID().toString().substring(0, 8), r.reservationId(),
                r.confirmationNumber(), kind, content.locale(), properties.getTemplateVersion(),
                cipher.encrypt(r.guestEmail()), Masking.email(r.guestEmail()), content, clock.instant());
        message.history.add(new StatusChange(DeliveryStatus.QUEUED, clock.instant(), kind.name()));
        messages.put(message.id, message);
        return message;
    }

    private Mono<Void> deliver(Message message, String recipient) {
        return Mono.fromCallable(() -> {
            synchronized (message) {
                message.attempts++;
            }
            return provider.send(recipient, message.subject, message.html, message.text);
        }).subscribeOn(Schedulers.boundedElastic())
                .retryWhen(Retry.backoff(properties.getMaxSendAttempts() - 1L, Duration.ofMillis(20))
                        .filter(EmailProvider.ProviderException.class::isInstance)
                        .onRetryExhaustedThrow((spec, signal) -> signal.failure()))
                .doOnNext(id -> {
                    message.providerMessageId = id;
                    transition(message, DeliveryStatus.SENT, "accepted by provider");
                    if (properties.isSimulateDelivery()) {
                        transition(message, provider.willBounce(recipient) ? DeliveryStatus.BOUNCED : DeliveryStatus.DELIVERED,
                                "simulated provider webhook");
                    }
                })
                .then()
                .onErrorResume(EmailProvider.ProviderException.class, e -> {
                    transition(message, DeliveryStatus.FAILED, "provider rejected after " + message.attempts + " attempt(s)");
                    return Mono.empty();
                })
                .then(Mono.defer(() -> emailStatus(message)));
    }

    private Mono<Void> emailStatus(Message message) {
        return events.event(EventNames.EMAIL_STATUS).outcome(message.status.name().toLowerCase(Locale.ROOT))
                .attr("messageId", message.id).attr("reservationId", message.reservationId)
                .attr("kind", message.kind.name()).attr("attempts", message.attempts).publish();
    }

    private void transition(Message message, DeliveryStatus status, String detail) {
        synchronized (message) {
            message.status = status;
            message.history.add(new StatusChange(status, clock.instant(), detail));
        }
    }

    private MessageView view(Message m, boolean unmasked) {
        synchronized (m) {
            return new MessageView(m.id, m.reservationId, m.confirmationNumber, m.kind, m.locale, m.templateVersion,
                    unmasked ? cipher.decrypt(m.recipientSealed) : m.recipientMasked, m.status, m.attempts,
                    List.copyOf(m.history), m.subject, m.html, m.text, m.createdAt);
        }
    }

    private ConfirmationRequest seal(ConfirmationRequest r) {
        return new ConfirmationRequest(r.reservationId(), r.confirmationNumber(), r.status(), r.locale(),
                cipher.encrypt(r.guestFirstName()), cipher.encrypt(r.guestLastName()), cipher.encrypt(r.guestEmail()),
                r.hotel(), r.checkIn(), r.checkOut(), r.nights(), r.rooms(), r.adults(), r.children(), r.roomName(),
                r.ratePlanName(), r.items(), r.total(), r.paymentRule(), r.cancellationTerms(), r.refundable());
    }

    private ConfirmationRequest unseal(ConfirmationRequest r) {
        return new ConfirmationRequest(r.reservationId(), r.confirmationNumber(), r.status(), r.locale(),
                cipher.decrypt(r.guestFirstName()), cipher.decrypt(r.guestLastName()), cipher.decrypt(r.guestEmail()),
                r.hotel(), r.checkIn(), r.checkOut(), r.nights(), r.rooms(), r.adults(), r.children(), r.roomName(),
                r.ratePlanName(), r.items(), r.total(), r.paymentRule(), r.cancellationTerms(), r.refundable());
    }

    private static boolean allow(Map<String, Deque<Instant>> buckets, String key, int limit, Duration window, Instant now) {
        Deque<Instant> bucket = buckets.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (bucket) {
            while (!bucket.isEmpty() && !bucket.peekFirst().isAfter(now.minus(window))) {
                bucket.removeFirst();
            }
            if (bucket.size() >= limit) {
                return false;
            }
            bucket.addLast(now);
            return true;
        }
    }

    private static ApiException tooMany() {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RESEND_RATE_LIMITED",
                "Too many resend requests. Please wait before trying again.", true, List.of());
    }
}


# notification-service/src/main/java/com/hotelbooking/notification/NotificationServiceApplication.java
package com.hotelbooking.notification;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/** Epic 6 (AQPI-23): confirmation content, e-mail delivery tracking and safe resend. */
@SpringBootApplication
@EnableConfigurationProperties(NotificationProperties.class)
public class NotificationServiceApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(NotificationServiceApplication.class)
                .properties("spring.config.name=notification-service").run(args);
    }
}


# notification-service/src/main/java/com/hotelbooking/notification/TemplateRenderer.java
package com.hotelbooking.notification;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.hotelbooking.notification.NotificationApi.ConfirmationRequest;
import com.hotelbooking.notification.NotificationApi.Item;

/**
 * Localised, accessible confirmation e-mail (stories 8.1, 9.3 AC4): lang attribute, title, headings, a captioned
 * table with header cells, text labels rather than colour, and a plain-text alternative.
 */
@Component
public class TemplateRenderer {

    public record Rendered(String locale, String subject, String html, String text) {
    }

    private static final Map<String, Map<String, String>> LABELS = Map.of(
            "en", labels("subject", "Your booking is confirmed - %s", "title", "Booking confirmed", "hello", "Hello %s,",
                    "intro", "Your reservation is confirmed.", "number", "Confirmation number", "stay", "Your stay",
                    "checkIn", "Check-in", "checkOut", "Check-out", "items", "What you booked", "total", "Total",
                    "policies", "Policies", "freeUntil", "Free cancellation until %s (%d hours before check-in).",
                    "cancelSubject", "Your booking is cancelled - %s", "cancelTitle", "Booking cancelled",
                    "cancelIntro", "Your reservation has been cancelled free of charge. No payment will be taken."),
            "fr", labels("subject", "Votre réservation est confirmée - %s", "title", "Réservation confirmée",
                    "hello", "Bonjour %s,", "intro", "Votre réservation est confirmée.", "number", "Numéro de confirmation",
                    "stay", "Votre séjour", "checkIn", "Arrivée", "checkOut", "Départ", "items", "Votre réservation",
                    "total", "Total", "policies", "Conditions",
                    "freeUntil", "Annulation gratuite jusqu'au %s (%d heures avant l'arrivée).",
                    "cancelSubject", "Votre réservation est annulée - %s", "cancelTitle", "Réservation annulée",
                    "cancelIntro", "Votre réservation a été annulée sans frais. Aucun paiement ne sera prélevé."),
            "es", labels("subject", "Su reserva está confirmada - %s", "title", "Reserva confirmada",
                    "hello", "Hola %s:", "intro", "Su reserva está confirmada.", "number", "Número de confirmación",
                    "stay", "Su estancia", "checkIn", "Entrada", "checkOut", "Salida", "items", "Lo que ha reservado",
                    "total", "Total", "policies", "Condiciones",
                    "freeUntil", "Cancelación gratuita hasta el %s (%d horas antes de la entrada).",
                    "cancelSubject", "Su reserva está cancelada - %s", "cancelTitle", "Reserva cancelada",
                    "cancelIntro", "Su reserva se ha cancelado sin coste. No se cobrará ningún importe."));

    private static final DateTimeFormatter DEADLINE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'");

    private final NotificationProperties properties;

    private static Map<String, String> labels(String... pairs) {
        Map<String, String> map = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put(pairs[i], pairs[i + 1]);
        }
        return Map.copyOf(map);
    }

    public TemplateRenderer(NotificationProperties properties) {
        this.properties = properties;
    }

    public String resolveLocale(String requested) {
        return requested != null && properties.getLocales().contains(requested) ? requested : properties.getLocales().get(0);
    }

    public Rendered render(ConfirmationRequest r) {
        String tag = resolveLocale(r.locale());
        Locale locale = Locale.forLanguageTag(tag);
        Map<String, String> l = LABELS.getOrDefault(locale.getLanguage(), LABELS.get("en"));
        DateTimeFormatter dates = DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale);
        String subject = l.get("subject").formatted(r.confirmationNumber());
        String checkIn = r.checkIn().format(dates) + (r.hotel().checkInFrom() == null ? "" : " (" + r.hotel().checkInFrom() + ")");
        String checkOut = r.checkOut().format(dates) + (r.hotel().checkOutUntil() == null ? "" : " (" + r.hotel().checkOutUntil() + ")");
        String deadline = freeCancellationDeadline(r, l);
        String payment = "PAY_NOW".equals(r.paymentRule()) ? "Paid in full at booking" : "Pay at the hotel";
        StringBuilder rows = new StringBuilder();
        StringBuilder textRows = new StringBuilder();
        if (r.items() != null) {
            for (Item i : r.items()) {
                rows.append("<tr><td>").append(esc(i.label())).append("</td><td>").append(i.quantity())
                        .append("</td><td>").append(amount(i)).append("</td></tr>\n");
                textRows.append("- ").append(i.label()).append(" x").append(i.quantity()).append(": ").append(amount(i)).append('\n');
            }
        }
        String total = r.total().amount().toPlainString() + " " + r.total().currency();
        String html = """
                <!DOCTYPE html>
                <html lang="%s">
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>%s</title></head>
                <body>
                <main role="main" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">
                <h1>%s</h1>
                <p>%s</p>
                <p>%s</p>
                <p><strong>%s:</strong> %s</p>
                <h2>%s</h2>
                <p>%s<br>%s</p>
                <dl><dt>%s</dt><dd>%s</dd><dt>%s</dt><dd>%s</dd><dt>Room</dt><dd>%s - %s</dd>
                <dt>Guests</dt><dd>%d room(s), %d adult(s), %d child(ren)</dd></dl>
                <h2>%s</h2>
                <table>
                <caption>%s</caption>
                <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Amount</th></tr></thead>
                <tbody>
                %s</tbody>
                <tfoot><tr><th scope="row" colspan="2">%s</th><td>%s</td></tr></tfoot>
                </table>
                <p>Payment: %s</p>
                <h2>%s</h2>
                <p>%s</p>%s
                </main>
                </body>
                </html>
                """.formatted(tag, esc(subject), esc(l.get("title")), esc(l.get("hello").formatted(r.guestFirstName())),
                esc(l.get("intro")), esc(l.get("number")), esc(r.confirmationNumber()), esc(l.get("stay")),
                esc(r.hotel().name()), esc(join(r.hotel().address(), r.hotel().city())), esc(l.get("checkIn")),
                esc(checkIn), esc(l.get("checkOut")), esc(checkOut), esc(r.roomName()), esc(r.ratePlanName()),
                r.rooms(), r.adults(), r.children(), esc(l.get("items")), esc(l.get("items")), rows,
                esc(l.get("total")), esc(total), esc(payment), esc(l.get("policies")), esc(r.cancellationTerms()),
                deadline.isEmpty() ? "" : "\n<p><strong>" + esc(deadline) + "</strong></p>");
        String text = l.get("title") + "\n\n" + l.get("hello").formatted(r.guestFirstName()) + "\n" + l.get("intro") + "\n\n"
                + l.get("number") + ": " + r.confirmationNumber() + "\n\n" + r.hotel().name() + ", "
                + join(r.hotel().address(), r.hotel().city()) + "\n" + l.get("checkIn") + ": " + checkIn + "\n"
                + l.get("checkOut") + ": " + checkOut + "\nRoom: " + r.roomName() + " - " + r.ratePlanName() + "\n\n"
                + l.get("items") + ":\n" + textRows + l.get("total") + ": " + total + "\nPayment: " + payment + "\n\n"
                + l.get("policies") + ": " + r.cancellationTerms() + "\n" + (deadline.isEmpty() ? "" : deadline + "\n");
        return new Rendered(tag, subject, html, text);
    }

    /** Story 8.1 (release 2.0): a refundable booking states when free cancellation closes. */
    private String freeCancellationDeadline(ConfirmationRequest r, Map<String, String> l) {
        if (!Boolean.TRUE.equals(r.refundable())) {
            return "";
        }
        long hours = properties.getFreeCancellationWindow().toHours();
        String at = r.checkIn().atStartOfDay(ZoneOffset.UTC).minus(properties.getFreeCancellationWindow()).format(DEADLINE);
        return l.get("freeUntil").formatted(at, hours);
    }

    /** Story 8.4: cancellation e-mail with the same accessibility rules as the confirmation. */
    public Rendered renderCancellation(ConfirmationRequest r) {
        String tag = resolveLocale(r.locale());
        Locale locale = Locale.forLanguageTag(tag);
        Map<String, String> l = LABELS.getOrDefault(locale.getLanguage(), LABELS.get("en"));
        DateTimeFormatter dates = DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale);
        String subject = l.get("cancelSubject").formatted(r.confirmationNumber());
        String hello = l.get("hello").formatted(r.guestFirstName());
        String stay = r.hotel().name() + " - " + r.checkIn().format(dates) + " / " + r.checkOut().format(dates);
        String html = """
                <!DOCTYPE html>
                <html lang="%s">
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>%s</title></head>
                <body>
                <main role="main" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">
                <h1>%s</h1>
                <p>%s</p>
                <p>%s</p>
                <p><strong>%s:</strong> %s</p>
                <h2>%s</h2>
                <p>%s</p>
                </main>
                </body>
                </html>
                """.formatted(tag, esc(subject), esc(l.get("cancelTitle")), esc(hello), esc(l.get("cancelIntro")),
                esc(l.get("number")), esc(r.confirmationNumber()), esc(l.get("stay")), esc(stay));
        String text = l.get("cancelTitle") + "\n\n" + hello + "\n" + l.get("cancelIntro") + "\n\n" + l.get("number") + ": "
                + r.confirmationNumber() + "\n" + stay + "\n";
        return new Rendered(tag, subject, html, text);
    }

    private static String amount(Item i) {
        return i.amount().amount().toPlainString() + " " + i.amount().currency();
    }

    private static String join(String a, String b) {
        return a == null ? (b == null ? "" : b) : b == null ? a : a + ", " + b;
    }

    static String esc(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}


# notification-service/src/main/resources/notification-service.yml
server:
  port: 8086
platform:
  service: notification-service
  environment: local
  notification:
    # @rule [AQPI-35] A confirmation can be resent at most 5 times per booking in 24 hours.
    max-send-attempts: 3
    resend-limit-per-booking: 5
    resend-booking-window: 24h
    resend-limit-per-client: 10
    resend-client-window: 1h
    simulate-delivery: true
    # @rule [AQPI-25] Operations can retry a failed confirmation e-mail at most 3 times; a further retry is refused.
    max-manual-retries: 3
    # @rule [AQPI-24] The confirmation e-mail of a refundable booking states its free-cancellation deadline, 48 hours before check-in.
    free-cancellation-window: 48h
    # @rule [AQPI-37] A cancelled reservation gets one cancellation e-mail; cancelling it again does not send another.
    # @rule [AQPI-37] A cancellation e-mail that cannot be sent does not undo the cancellation.
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics


# offer-service/src/main/java/com/hotelbooking/offer/ConsentStore.java
package com.hotelbooking.offer;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.hotelbooking.offer.OfferApi.Consent;
import com.hotelbooking.offer.OfferApi.Interest;

/** Consented profile interests with retention (stories 5.1 BR, 5.3 AC3, 9.1 AC5). */
@Component
public class ConsentStore {

    public static class UnavailableException extends RuntimeException {
        public UnavailableException() {
            super("profile store unavailable");
        }
    }

    private final Map<String, Consent> consents = new ConcurrentHashMap<>();
    private final Clock clock;
    private final OfferProperties properties;
    private volatile boolean available = true;

    public ConsentStore(Clock clock, OfferProperties properties) {
        this.clock = clock;
        this.properties = properties;
    }

    public Consent save(String profileId, boolean personalization, List<Interest> interests) {
        Instant now = clock.instant();
        Consent consent = new Consent(profileId, personalization, personalization ? List.copyOf(interests) : List.of(),
                now, now.plus(Duration.ofDays(properties.getConsentRetentionDays())));
        consents.put(profileId, consent);
        return consent;
    }

    /** Expired consents are deleted on read, so they are never used. */
    public Optional<Consent> find(String profileId) {
        if (!available) {
            throw new UnavailableException();
        }
        Consent c = consents.get(profileId);
        if (c != null && !c.expiresAt().isAfter(clock.instant())) {
            consents.remove(profileId);
            return Optional.empty();
        }
        return Optional.ofNullable(c);
    }

    public boolean delete(String profileId) {
        return consents.remove(profileId) != null;
    }

    public void setAvailable(boolean value) {
        this.available = value;
    }

    public void reset() {
        consents.clear();
        available = true;
    }
}


# offer-service/src/main/java/com/hotelbooking/offer/OfferApi.java
package com.hotelbooking.offer;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.common.money.Money;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/** Request and response shapes for offer-service. */
public final class OfferApi {

    private OfferApi() {
    }

    /** Approved interest categories. Free text and sensitive traits are not accepted (story 5.1 BR). */
    public enum Interest {
        DINING,
        WELLNESS,
        SIGHTSEEING,
        FAMILY,
        BUSINESS,
        ROMANCE,
        TRANSPORT
    }

    public enum PricingUnit {
        PER_STAY,
        PER_NIGHT
    }

    public enum Action {
        ADD,
        SKIP,
        DISMISS
    }

    public record OfferContext(@NotBlank String hotelId, @NotBlank String destination, @NotNull LocalDate checkIn,
            @NotNull LocalDate checkOut, String roomCode, String ratePlanCode, @Min(1) int adults, @Min(0) int children,
            @NotBlank String currency, List<String> hotelAmenities, List<Interest> declaredInterests, String profileId,
            String sessionId) {
    }

    /** Story 5.2: name, description, price, currency, applicability, restrictions; marked as optional. */
    public record Offer(String code, String name, String description, Interest category, Money unitPrice,
            PricingUnit pricingUnit, Money priceForStay, String currency, String applicability, String restrictions,
            int maxQuantity, String kind, String kindLabel, List<String> reasonCodes, boolean personalized) {
    }

    public record Exclusion(String code, String reason) {
    }

    public record OfferResponse(List<Offer> offers, boolean personalized, boolean contextualDefaults, String disclosure,
            String fallbackReason, String rulesVersion, String modelVersion, List<Exclusion> excluded,
            boolean proceedWithoutOffers) {
    }

    public record Interaction(@NotBlank String sessionId, @NotBlank String offerCode, @NotNull Action action) {
    }

    public record ConsentRequest(boolean personalization, List<Interest> interests) {
    }

    public record Consent(String profileId, boolean personalization, List<Interest> interests, Instant grantedAt,
            Instant expiresAt) {
    }

    public record ItemRequest(@NotBlank String code, @Min(1) int quantity) {
    }

    public record ValidationRequest(@NotNull @Valid OfferContext context, @NotEmpty List<@Valid ItemRequest> items) {
    }

    public record ItemValidation(String code, String name, boolean eligible, boolean available, int quantity,
            int maxQuantity, boolean quantityAllowed, Money unitPrice, PricingUnit pricingUnit, Money linePrice,
            String reason) {
    }

    public record ValidationResponse(List<ItemValidation> items, String rulesVersion) {
    }
}


# offer-service/src/main/java/com/hotelbooking/offer/OfferCatalog.java
package com.hotelbooking.offer;

import java.math.BigDecimal;
import java.time.Month;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.hotelbooking.offer.OfferApi.Interest;
import com.hotelbooking.offer.OfferApi.PricingUnit;

/** Ancillary products and their eligibility rules (version {@code offer-rules-v3}). */
@Component
public class OfferCatalog {

    public record Product(String code, String name, String description, Interest category, PricingUnit unit,
            Map<String, BigDecimal> prices, int maxQuantity, int basePriority, Set<String> destinations,
            String requiredAmenity, boolean requiresChildren, int minNights, Set<String> excludedRatePlans,
            Set<Month> season, String applicability, String restrictions) {
    }

    private final List<Product> products = List.of(
            product("BREAKFAST", "Daily breakfast", "Buffet breakfast for every guest in the room", Interest.DINING,
                    PricingUnit.PER_NIGHT, "24", 4, 5, Set.of(), null, false, 1, Set.of("BB"), Set.of(),
                    "All guests in the booked room", "Not offered on rates that already include breakfast"),
            product("LATE_CHECKOUT", "Late check-out (2 pm)", "Keep your room until 2 pm on departure day",
                    Interest.BUSINESS, PricingUnit.PER_STAY, "35", 1, 4, Set.of(), null, false, 1, Set.of(), Set.of(),
                    "Departure day", "Subject to confirmation at check-in"),
            product("AIRPORT_TRANSFER", "Airport transfer", "Private one-way car from the airport", Interest.TRANSPORT,
                    PricingUnit.PER_STAY, "75", 2, 3, Set.of("NYC", "LON", "PAR"), null, false, 1, Set.of(), Set.of(),
                    "Arrival day, up to 3 passengers", "Book at least 24 hours before arrival"),
            product("PARKING", "On-site parking", "Secure parking space for one car", Interest.TRANSPORT,
                    PricingUnit.PER_NIGHT, "40", 2, 2, Set.of(), "parking", false, 1, Set.of(), Set.of(),
                    "Per car per night", "Vehicles up to 2 m high"),
            product("SPA_ACCESS", "Spa day pass", "Full-day spa and thermal suite access", Interest.WELLNESS,
                    PricingUnit.PER_STAY, "60", 4, 2, Set.of(), "spa", false, 1, Set.of(), Set.of(),
                    "Per adult", "Guests 18 and over"),
            product("KIDS_CLUB", "Kids club", "Supervised activities for children aged 4-12", Interest.FAMILY,
                    PricingUnit.PER_NIGHT, "30", 3, 2, Set.of(), null, true, 1, Set.of(), Set.of(),
                    "Per child per day", "Ages 4 to 12"),
            product("CITY_TOUR", "Guided city tour", "Three-hour walking tour with a local guide", Interest.SIGHTSEEING,
                    PricingUnit.PER_STAY, "45", 6, 2, Set.of("LON", "PAR"), null, false, 2, Set.of(), Set.of(),
                    "Per person", "Runs daily at 10 am"),
            product("ROMANCE", "Romance package", "Champagne, flowers and chocolates in the room", Interest.ROMANCE,
                    PricingUnit.PER_STAY, "95", 1, 1, Set.of(), null, false, 1, Set.of(), Set.of(),
                    "Once per stay", "Guests 21 and over"),
            product("WINTER_SKATING", "Ice-skating pass", "Seasonal rink entry near the hotel", Interest.FAMILY,
                    PricingUnit.PER_STAY, "25", 6, 2, Set.of("NYC"), null, false, 1, Set.of(),
                    Set.of(Month.NOVEMBER, Month.DECEMBER, Month.JANUARY, Month.FEBRUARY),
                    "Per person", "November to February only"));

    private final Map<String, Boolean> available = new ConcurrentHashMap<>();

    public List<Product> products() {
        return products;
    }

    public Optional<Product> find(String code) {
        return products.stream().filter(p -> p.code().equals(code)).findFirst();
    }

    public boolean isAvailable(String code) {
        return available.getOrDefault(code, true);
    }

    /** Demo control: mark a product sold out (stories 5.1 AC2, 6.2 AC4). */
    public void setAvailable(String code, boolean value) {
        available.put(code, value);
    }

    public void reset() {
        available.clear();
    }

    private static Product product(String code, String name, String description, Interest category, PricingUnit unit,
            String usd, int maxQuantity, int priority, Set<String> destinations, String amenity, boolean children,
            int minNights, Set<String> excludedRates, Set<Month> season, String applicability, String restrictions) {
        BigDecimal base = new BigDecimal(usd);
        Map<String, BigDecimal> prices = Map.of("USD", base, "GBP", base.multiply(new BigDecimal("0.80")),
                "EUR", base.multiply(new BigDecimal("0.92")));
        return new Product(code, name, description, category, unit, prices, maxQuantity, priority, destinations, amenity,
                children, minNights, excludedRates, season, applicability, restrictions);
    }
}


# offer-service/src/main/java/com/hotelbooking/offer/OfferController.java
package com.hotelbooking.offer;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.hotelbooking.common.events.EventNames;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.web.ApiException;
import com.hotelbooking.offer.OfferApi.Consent;
import com.hotelbooking.offer.OfferApi.ConsentRequest;
import com.hotelbooking.offer.OfferApi.Interaction;
import com.hotelbooking.offer.OfferApi.OfferContext;
import com.hotelbooking.offer.OfferApi.OfferResponse;
import com.hotelbooking.offer.OfferApi.ValidationRequest;
import com.hotelbooking.offer.OfferApi.ValidationResponse;

import jakarta.validation.Valid;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api")
public class OfferController {

    private final OfferEngine engine;
    private final ConsentStore consents;
    private final OfferCatalog catalog;
    private final OfferProperties properties;
    private final EventPublisher events;

    public OfferController(OfferEngine engine, ConsentStore consents, OfferCatalog catalog, OfferProperties properties,
            EventPublisher events) {
        this.engine = engine;
        this.consents = consents;
        this.catalog = catalog;
        this.properties = properties;
        this.events = events;
    }

    /** Stories 5.1, 5.2, 5.3 (AQPI-11, AQPI-12, AQPI-13). */
    @PostMapping("/offers/recommendations")
    public Mono<OfferResponse> recommend(@Valid @RequestBody OfferContext context) {
        return Mono.fromSupplier(() -> engine.recommend(context))
                .flatMap(r -> events.event(EventNames.OFFERS_RECOMMENDED).attr("hotelId", context.hotelId())
                        .attr("offers", r.offers().stream().map(o -> o.code() + ":" + String.join("|", o.reasonCodes())).toList())
                        .attr("excluded", r.excluded().stream().map(e -> e.code() + ":" + e.reason()).toList())
                        .attr("personalized", r.personalized()).attr("fallbackReason", r.fallbackReason())
                        .attr("rulesVersion", r.rulesVersion()).attr("modelVersion", r.modelVersion())
                        .publish().thenReturn(r));
    }

    /** Story 6.2 AC4: cart-service re-checks eligibility, stock and quantity limits. */
    @PostMapping("/offers/validate")
    public Mono<ValidationResponse> validate(@Valid @RequestBody ValidationRequest request) {
        return Mono.fromSupplier(() -> new ValidationResponse(engine.validate(request.context(), request.items()),
                properties.getRulesVersion()));
    }

    /** Story 5.2 AC2: add, skip or dismiss. Dismissed offers are not shown again in the session. */
    @PostMapping("/offers/interactions")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Mono<Void> interact(@Valid @RequestBody Interaction interaction) {
        return Mono.fromRunnable(() -> engine.interact(interaction.sessionId(), interaction.offerCode(), interaction.action()))
                .then(events.event(EventNames.OFFER_INTERACTION).attr("offerCode", interaction.offerCode())
                        .attr("action", interaction.action().name()).publish());
    }

    /** Story 5.3 AC3: consent changes apply to the next recommendation. */
    @PutMapping("/consents/{profileId}")
    public Mono<Consent> consent(@PathVariable String profileId, @RequestBody ConsentRequest request) {
        return Mono.fromSupplier(() -> consents.save(profileId, request.personalization(),
                request.interests() == null ? List.of() : request.interests()))
                .flatMap(c -> events.event(EventNames.CONSENT_CHANGED).attr("personalization", c.personalization())
                        .attr("categories", c.interests().size()).publish().thenReturn(c));
    }

    @GetMapping("/consents/{profileId}")
    public Mono<Consent> getConsent(@PathVariable String profileId) {
        return Mono.fromSupplier(() -> consents.find(profileId).orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "CONSENT_NOT_FOUND", "No preferences are stored for this profile.")));
    }

    @DeleteMapping("/consents/{profileId}")
    public Mono<Map<String, Object>> deleteConsent(@PathVariable String profileId) {
        return Mono.fromSupplier(() -> Map.of("profileId", profileId, "deleted", consents.delete(profileId)));
    }

    @PutMapping("/admin/offers/{code}/availability")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> availability(@PathVariable String code, @RequestBody Map<String, Boolean> body) {
        return Mono.fromRunnable(() -> catalog.setAvailable(code, Boolean.TRUE.equals(body.get("available"))));
    }

    @PutMapping("/admin/profile-store")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> profileStore(@RequestBody Map<String, Boolean> body) {
        return Mono.fromRunnable(() -> consents.setAvailable(Boolean.TRUE.equals(body.get("available"))));
    }

    @PostMapping("/admin/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> reset() {
        return Mono.fromRunnable(() -> {
            catalog.reset();
            consents.reset();
            engine.reset();
        });
    }
}


# offer-service/src/main/java/com/hotelbooking/offer/OfferEngine.java
package com.hotelbooking.offer;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.hotelbooking.common.money.Money;
import com.hotelbooking.offer.OfferApi.Consent;
import com.hotelbooking.offer.OfferApi.Exclusion;
import com.hotelbooking.offer.OfferApi.Interest;
import com.hotelbooking.offer.OfferApi.ItemRequest;
import com.hotelbooking.offer.OfferApi.ItemValidation;
import com.hotelbooking.offer.OfferApi.Offer;
import com.hotelbooking.offer.OfferApi.OfferContext;
import com.hotelbooking.offer.OfferApi.OfferResponse;
import com.hotelbooking.offer.OfferCatalog.Product;

/**
 * Eligibility then ranking (stories 5.1-5.3). Eligibility uses only stay context; ranking may use declared
 * interests and, with consent, profile interests. No other personal attributes are read.
 */
@Service
public class OfferEngine {

    public static final String KIND = "OPTIONAL_EXTRA";
    public static final String KIND_LABEL = "Optional extra - not included in the room price and not a mandatory fee";

    private final OfferCatalog catalog;
    private final ConsentStore consents;
    private final OfferProperties properties;
    private final Map<String, Set<String>> dismissed = new ConcurrentHashMap<>();

    public OfferEngine(OfferCatalog catalog, ConsentStore consents, OfferProperties properties) {
        this.catalog = catalog;
        this.consents = consents;
        this.properties = properties;
    }

    public OfferResponse recommend(OfferContext ctx) {
        List<Exclusion> excluded = new ArrayList<>();
        Set<Interest> profile = Set.of();
        String fallback = null;
        if (ctx.profileId() != null && !ctx.profileId().isBlank()) {
            try {
                Optional<Consent> consent = consents.find(ctx.profileId());
                if (consent.isPresent() && consent.get().personalization()) {
                    profile = Set.copyOf(consent.get().interests());
                } else {
                    fallback = "NO_PERSONALIZATION_CONSENT";
                }
            } catch (ConsentStore.UnavailableException e) {
                fallback = "PROFILE_DATA_UNAVAILABLE";
            }
        }
        Set<Interest> declared = ctx.declaredInterests() == null ? Set.of() : Set.copyOf(ctx.declaredInterests());
        Set<String> sessionDismissed = ctx.sessionId() == null ? Set.of() : dismissed.getOrDefault(ctx.sessionId(), Set.of());
        record Scored(Offer offer, int score) {
        }
        List<Scored> scored = new ArrayList<>();
        for (Product p : catalog.products()) {
            String reason = ineligibility(p, ctx);
            if (reason == null && sessionDismissed.contains(p.code())) {
                reason = "DISMISSED_BY_GUEST";
            }
            if (reason != null) {
                excluded.add(new Exclusion(p.code(), reason));
                continue;
            }
            List<String> reasons = new ArrayList<>();
            int score = p.basePriority();
            boolean personalized = false;
            if (declared.contains(p.category())) {
                score += 3;
                reasons.add("DECLARED_INTEREST_" + p.category());
                personalized = true;
            }
            if (profile.contains(p.category())) {
                score += 2;
                reasons.add("CONSENTED_PROFILE_INTEREST_" + p.category());
                personalized = true;
            }
            if (p.requiresChildren() || (p.category() == Interest.FAMILY && ctx.children() > 0)) {
                score += 2;
                reasons.add("PARTY_INCLUDES_CHILDREN");
            }
            if (!p.season().isEmpty()) {
                score += 1;
                reasons.add("SEASONAL_" + ctx.checkIn().getMonth().name());
            }
            if (p.requiredAmenity() != null) {
                reasons.add("HOTEL_HAS_" + p.requiredAmenity().toUpperCase(Locale.ROOT));
            }
            if (nights(ctx) >= 4 && p.unit() == OfferApi.PricingUnit.PER_STAY) {
                score += 1;
                reasons.add("LONGER_STAY");
            }
            if (reasons.isEmpty()) {
                reasons.add("POPULAR_AT_DESTINATION_" + ctx.destination().toUpperCase(Locale.ROOT));
            }
            scored.add(new Scored(offer(p, ctx, reasons, personalized), score));
        }
        List<Offer> offers = scored.stream()
                .sorted(Comparator.comparingInt(Scored::score).reversed().thenComparing(s -> s.offer().code()))
                .limit(properties.getMaxOffers()).map(Scored::offer).toList();
        boolean personalized = offers.stream().anyMatch(Offer::personalized);
        String disclosure = personalized
                ? "Some offers are suggested using interests you shared with us. You can change this in your preferences at any time."
                : "These offers are based on your stay details only.";
        return new OfferResponse(offers, personalized, !personalized, disclosure, fallback, properties.getRulesVersion(),
                properties.getModelVersion(), excluded, true);
    }

    public List<ItemValidation> validate(OfferContext ctx, List<ItemRequest> items) {
        return items.stream().map(item -> catalog.find(item.code()).map(p -> {
            String reason = ineligibility(p, ctx);
            boolean available = catalog.isAvailable(p.code());
            boolean eligible = reason == null || "SOLD_OUT".equals(reason);
            boolean quantityOk = item.quantity() >= 1 && item.quantity() <= p.maxQuantity();
            Money unit = unitPrice(p, ctx.currency());
            Money line = lineTotal(p, ctx, item.quantity());
            String why = reason != null ? reason : !quantityOk ? "QUANTITY_LIMIT_" + p.maxQuantity() : null;
            return new ItemValidation(p.code(), p.name(), eligible, available, item.quantity(), p.maxQuantity(),
                    quantityOk, unit, p.unit(), line, why);
        }).orElse(new ItemValidation(item.code(), null, false, false, item.quantity(), 0, false, null, null, null,
                "UNKNOWN_PRODUCT"))).toList();
    }

    public void interact(String sessionId, String code, OfferApi.Action action) {
        if (action == OfferApi.Action.DISMISS) {
            dismissed.computeIfAbsent(sessionId, k -> ConcurrentHashMap.newKeySet()).add(code);
        }
    }

    public void reset() {
        dismissed.clear();
    }

    /** Returns null when eligible, otherwise the exclusion reason. */
    String ineligibility(Product p, OfferContext ctx) {
        if (!p.prices().containsKey(ctx.currency())) {
            return "CURRENCY_NOT_SUPPORTED";
        }
        if (!p.destinations().isEmpty() && !p.destinations().contains(ctx.destination().toUpperCase(Locale.ROOT))) {
            return "NOT_OFFERED_AT_DESTINATION";
        }
        if (p.requiredAmenity() != null && (ctx.hotelAmenities() == null
                || !new HashSet<>(ctx.hotelAmenities()).contains(p.requiredAmenity()))) {
            return "HOTEL_LACKS_" + p.requiredAmenity().toUpperCase(Locale.ROOT);
        }
        if (p.requiresChildren() && ctx.children() == 0) {
            return "PARTY_HAS_NO_CHILDREN";
        }
        if (nights(ctx) < p.minNights()) {
            return "STAY_TOO_SHORT";
        }
        if (ctx.ratePlanCode() != null && p.excludedRatePlans().contains(ctx.ratePlanCode())) {
            return "ALREADY_INCLUDED_IN_RATE";
        }
        if (!p.season().isEmpty() && !p.season().contains(ctx.checkIn().getMonth())) {
            return "OUT_OF_SEASON";
        }
        if (!catalog.isAvailable(p.code())) {
            return "SOLD_OUT";
        }
        return null;
    }

    private Offer offer(Product p, OfferContext ctx, List<String> reasons, boolean personalized) {
        return new Offer(p.code(), p.name(), p.description(), p.category(), unitPrice(p, ctx.currency()), p.unit(),
                lineTotal(p, ctx, 1), ctx.currency(), p.applicability(), p.restrictions(), p.maxQuantity(), KIND,
                KIND_LABEL, List.copyOf(reasons), personalized);
    }

    private static Money unitPrice(Product p, String currency) {
        return new Money(p.prices().getOrDefault(currency, BigDecimal.ZERO), currency);
    }

    static Money lineTotal(Product p, OfferContext ctx, int quantity) {
        Money unit = unitPrice(p, ctx.currency()).times(quantity);
        return p.unit() == OfferApi.PricingUnit.PER_NIGHT ? unit.times(nights(ctx)) : unit;
    }

    static long nights(OfferContext ctx) {
        return ChronoUnit.DAYS.between(ctx.checkIn(), ctx.checkOut());
    }
}


# offer-service/src/main/java/com/hotelbooking/offer/OfferProperties.java
package com.hotelbooking.offer;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("platform.offers")
public class OfferProperties {

    private int maxOffers = 5;
    private int consentRetentionDays = 365;
    private String rulesVersion = "offer-rules-v3";
    private String modelVersion = "contextual-ranker-1.2";

    public int getMaxOffers() {
        return maxOffers;
    }

    public void setMaxOffers(int maxOffers) {
        this.maxOffers = maxOffers;
    }

    public int getConsentRetentionDays() {
        return consentRetentionDays;
    }

    public void setConsentRetentionDays(int consentRetentionDays) {
        this.consentRetentionDays = consentRetentionDays;
    }

    public String getRulesVersion() {
        return rulesVersion;
    }

    public void setRulesVersion(String rulesVersion) {
        this.rulesVersion = rulesVersion;
    }

    public String getModelVersion() {
        return modelVersion;
    }

    public void setModelVersion(String modelVersion) {
        this.modelVersion = modelVersion;
    }
}


# offer-service/src/main/java/com/hotelbooking/offer/OfferServiceApplication.java
package com.hotelbooking.offer;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/** Epic 3 (AQPI-10): eligible, explainable, consent-aware ancillary offers. */
@SpringBootApplication
@EnableConfigurationProperties(OfferProperties.class)
public class OfferServiceApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(OfferServiceApplication.class).properties("spring.config.name=offer-service").run(args);
    }
}


# offer-service/src/main/resources/offer-service.yml
server:
  port: 8083
platform:
  service: offer-service
  environment: local
  offers:
    max-offers: 5
    consent-retention-days: 365
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics


# platform-common/src/main/java/com/hotelbooking/common/events/BusinessEvent.java
package com.hotelbooking.common.events;

import java.time.Instant;
import java.util.Map;

/**
 * Versioned business event (story 9.2, AQPI-29). Business events go to the {@code business-events} logger;
 * technical logs use the service's own loggers, so the two are distinguishable.
 */
public record BusinessEvent(String name, int schemaVersion, Instant timestamp, String environment, String service,
        String correlationId, String outcome, String errorCategory, Long durationMs, Map<String, Object> attributes) {

    public static final String KIND = "business";

    public String kind() {
        return KIND;
    }
}


# platform-common/src/main/java/com/hotelbooking/common/events/EventNames.java
package com.hotelbooking.common.events;

/** Event taxonomy shared across search, selection, offers, cart, checkout, reservation and e-mail (story 9.2). */
public final class EventNames {

    public static final int SCHEMA_VERSION = 1;

    public static final String SEARCH_SUBMITTED = "search.submitted";
    public static final String SEARCH_VALIDATED = "search.validated";
    public static final String SEARCH_FAILED = "search.failed";
    public static final String RESULTS_IMPRESSION = "results.impression";
    public static final String RESULTS_REFINED = "results.refined";
    public static final String HOTEL_VIEWED = "hotel.viewed";
    public static final String RATE_SELECTED = "rate.selected";
    public static final String OFFERS_RECOMMENDED = "offers.recommended";
    public static final String OFFER_INTERACTION = "offer.interaction";
    public static final String CONSENT_CHANGED = "consent.changed";
    public static final String CART_UPDATED = "cart.updated";
    public static final String CART_VIEWED = "cart.viewed";
    public static final String CART_PRICE_ACKNOWLEDGED = "cart.price.acknowledged";
    public static final String CHECKOUT_FORM = "checkout.form";
    public static final String PAYMENT_AUTHORISATION = "payment.authorisation";
    public static final String RESERVATION_STATUS = "reservation.status";
    public static final String OUTCOME_VIEWED = "outcome.viewed";
    public static final String CONFIRMATION_GENERATED = "confirmation.generated";
    public static final String EMAIL_STATUS = "email.status";
    public static final String RESEND_REQUESTED = "confirmation.resend";
    public static final String CANCELLATION_REQUESTED = "reservation.cancellation";
    public static final String AUDIT_ACCESS = "audit.access";

    private EventNames() {
    }
}


# platform-common/src/main/java/com/hotelbooking/common/events/EventPublisher.java
package com.hotelbooking.common.events;

import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hotelbooking.common.privacy.Masking;
import com.hotelbooking.common.web.CorrelationId;

import io.micrometer.core.instrument.MeterRegistry;
import reactor.core.publisher.Mono;

/**
 * Publishes business events. Attribute keys that name personal or payment data are dropped and string values
 * are scrubbed, so events never carry prohibited payloads (stories 9.1, 9.2). A failure to log never fails the
 * caller (story 9.2 AC4).
 */
public class EventPublisher {

    private static final Logger EVENTS = LoggerFactory.getLogger("business-events");
    private static final Logger LOG = LoggerFactory.getLogger(EventPublisher.class);
    private static final Set<String> PROHIBITED_KEYS = Set.of("email", "firstname", "lastname", "name", "guestname",
            "phone", "cardnumber", "pan", "cvv", "cvc", "securitycode", "password", "secret", "paymenttoken",
            "address", "freetext", "interests", "preferences");
    private static final int RECENT_LIMIT = 500;

    private final ObjectMapper mapper;
    private final MeterRegistry meters;
    private final Clock clock;
    private final String environment;
    private final String service;
    private final Deque<BusinessEvent> recent = new ArrayDeque<>();

    public EventPublisher(ObjectMapper mapper, MeterRegistry meters, Clock clock, String environment, String service) {
        this.mapper = mapper;
        this.meters = meters;
        this.clock = clock;
        this.environment = environment;
        this.service = service;
    }

    public Builder event(String name) {
        return new Builder(name);
    }

    /** Recent events kept in memory for tests and the ops view. */
    public synchronized List<BusinessEvent> recent() {
        return List.copyOf(recent);
    }

    static boolean prohibited(String key) {
        return PROHIBITED_KEYS.contains(key.toLowerCase(Locale.ROOT).replace("_", "").replace("-", ""));
    }

    private void record(BusinessEvent event) {
        try {
            synchronized (this) {
                recent.addLast(event);
                while (recent.size() > RECENT_LIMIT) {
                    recent.removeFirst();
                }
            }
            meters.counter("booking.business.events", "event", event.name(), "outcome", event.outcome()).increment();
            EVENTS.info(mapper.writeValueAsString(event));
        } catch (RuntimeException | JsonProcessingException e) {
            LOG.warn("business event dropped name={} reason={}", event.name(), e.getClass().getSimpleName());
            meters.counter("booking.business.events.dropped", "event", event.name()).increment();
        }
    }

    public final class Builder {

        private final String name;
        private final Map<String, Object> attributes = new LinkedHashMap<>();
        private String outcome = "success";
        private String errorCategory;
        private Long durationMs;

        private Builder(String name) {
            this.name = name;
        }

        public Builder outcome(String value) {
            if (value != null) {
                this.outcome = value;
            }
            return this;
        }

        public Builder error(String category) {
            if (category != null) {
                this.outcome = "failure";
                this.errorCategory = category;
            }
            return this;
        }

        public Builder duration(long millis) {
            this.durationMs = millis;
            return this;
        }

        public Builder attr(String key, Object value) {
            if (value != null && !prohibited(key)) {
                attributes.put(key, value instanceof String s ? Masking.scrub(s) : value);
            }
            return this;
        }

        public Mono<Void> publish() {
            return Mono.deferContextual(ctx -> {
                record(new BusinessEvent(name, EventNames.SCHEMA_VERSION, clock.instant(), environment, service,
                        CorrelationId.from(ctx), outcome, errorCategory, durationMs, Map.copyOf(attributes)));
                return Mono.<Void>empty();
            }).onErrorResume(e -> Mono.empty());
        }
    }
}


# platform-common/src/main/java/com/hotelbooking/common/money/Money.java
package com.hotelbooking.common.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/** Amount and ISO currency; arithmetic refuses to mix currencies (story 6.3: currency shown consistently). */
public record Money(BigDecimal amount, String currency) {

    public Money {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
        amount = amount.setScale(2, RoundingMode.HALF_UP);
    }

    public static Money of(String amount, String currency) {
        return new Money(new BigDecimal(amount), currency);
    }

    public static Money zero(String currency) {
        return new Money(BigDecimal.ZERO, currency);
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    public Money minus(Money other) {
        requireSameCurrency(other);
        return new Money(amount.subtract(other.amount), currency);
    }

    public Money times(long quantity) {
        return new Money(amount.multiply(BigDecimal.valueOf(quantity)), currency);
    }

    public Money percent(BigDecimal rate) {
        return new Money(amount.multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP), currency);
    }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("Currency mismatch: " + currency + " vs " + other.currency);
        }
    }
}


# platform-common/src/main/java/com/hotelbooking/common/PlatformAutoConfiguration.java
package com.hotelbooking.common;

import java.time.Clock;
import java.time.Duration;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.reactive.function.client.WebClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.web.reactive.function.client.WebClient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.privacy.FieldCipher;
import com.hotelbooking.common.resilience.DependencyCalls;
import com.hotelbooking.common.resilience.PlatformProperties;
import com.hotelbooking.common.web.CorrelationIdWebFilter;
import com.hotelbooking.common.web.CorrelationPropagation;
import com.hotelbooking.common.web.GlobalErrorHandler;

import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.micrometer.core.instrument.MeterRegistry;

/** Wires the shared Epic 7 capabilities into every service. */
@AutoConfiguration
@EnableConfigurationProperties(PlatformProperties.class)
public class PlatformAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    CorrelationIdWebFilter correlationIdWebFilter() {
        return new CorrelationIdWebFilter();
    }

    @Bean
    GlobalErrorHandler globalErrorHandler() {
        return new GlobalErrorHandler();
    }

    @Bean
    WebClientCustomizer correlationPropagationCustomizer() {
        return builder -> builder.filter(CorrelationPropagation.filter());
    }

    @Bean
    EventPublisher eventPublisher(ObjectMapper mapper, MeterRegistry meters, Clock clock, PlatformProperties properties) {
        return new EventPublisher(mapper, meters, clock, properties.getEnvironment(), properties.getService());
    }

    @Bean
    @ConditionalOnMissingBean
    FieldCipher fieldCipher(PlatformProperties properties) {
        return new FieldCipher(properties.getDataKey());
    }

    @Bean
    @ConditionalOnMissingBean
    CircuitBreakerRegistry circuitBreakerRegistry() {
        return CircuitBreakerRegistry.of(CircuitBreakerConfig.custom()
                .recordException(DependencyCalls::transientFailure)
                .slidingWindowSize(20)
                .minimumNumberOfCalls(10)
                .failureRateThreshold(50)
                .waitDurationInOpenState(Duration.ofSeconds(10))
                .build());
    }

    @Bean
    DependencyCalls dependencyCalls(PlatformProperties properties, CircuitBreakerRegistry breakers, MeterRegistry meters) {
        return new DependencyCalls(properties, breakers, meters);
    }

    /** WebClient for a named dependency, using {@code platform.dependencies.<name>.base-url}. */
    public static WebClient client(WebClient.Builder builder, PlatformProperties properties, String dependency) {
        PlatformProperties.Policy policy = properties.getDependencies().get(dependency);
        if (policy == null || policy.getBaseUrl() == null) {
            throw new IllegalStateException("platform.dependencies." + dependency + ".base-url is not set");
        }
        return builder.clone().baseUrl(policy.getBaseUrl()).build();
    }
}


# platform-common/src/main/java/com/hotelbooking/common/privacy/DataClass.java
package com.hotelbooking.common.privacy;

/** Data classification used in the data map (story 9.1). */
public enum DataClass {
    PUBLIC,
    INTERNAL,
    PERSONAL,
    SENSITIVE_PERSONAL,
    PAYMENT
}


# platform-common/src/main/java/com/hotelbooking/common/privacy/DataMap.java
package com.hotelbooking.common.privacy;

import java.util.List;

/**
 * Where each personal or payment attribute is stored and processed (story 9.1 AC1). Kept in code so tests
 * can assert that nothing classified PAYMENT is ever stored by a booking service.
 */
public final class DataMap {

    public record Entry(String attribute, DataClass dataClass, String storedIn, String processing, String retention) {
    }

    public static final List<Entry> ENTRIES = List.of(
            new Entry("destination", DataClass.PUBLIC, "search-service (in memory)", "search", "session"),
            new Entry("guest.firstName", DataClass.PERSONAL, "reservation-service", "reservation, confirmation", "policy: stay + 24 months"),
            new Entry("guest.lastName", DataClass.PERSONAL, "reservation-service", "reservation, resend verification (hashed)", "policy: stay + 24 months"),
            new Entry("guest.email", DataClass.PERSONAL, "reservation-service, notification-service", "confirmation e-mail; masked elsewhere", "policy: stay + 24 months"),
            new Entry("guest.phone", DataClass.PERSONAL, "reservation-service", "hotel contact; masked elsewhere", "policy: stay + 24 months"),
            new Entry("consent.interests", DataClass.PERSONAL, "offer-service", "personalised offers, only with consent", "until consent withdrawn"),
            new Entry("payment.token", DataClass.PAYMENT, "payment provider only; reservation stores the provider reference", "authorisation", "provider policy"),
            new Entry("card.number", DataClass.PAYMENT, "never stored by this platform", "provider hosted fields only", "n/a"));

    private DataMap() {
    }
}


# platform-common/src/main/java/com/hotelbooking/common/privacy/FieldCipher.java
package com.hotelbooking.common.privacy;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** AES-256-GCM encryption for personal fields held at rest (story 9.1 AC2). */
public class FieldCipher {

    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    public FieldCipher(String base64Key) {
        this.key = base64Key == null || base64Key.isBlank() ? generate()
                : new SecretKeySpec(Base64.getDecoder().decode(base64Key), "AES");
    }

    public String encrypt(String plain) {
        if (plain == null) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("encryption failed", e);
        }
    }

    public String decrypt(String sealed) {
        if (sealed == null) {
            return null;
        }
        try {
            byte[] all = Base64.getDecoder().decode(sealed);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, all, 0, IV_BYTES));
            return new String(cipher.doFinal(all, IV_BYTES, all.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("decryption failed", e);
        }
    }

    private static SecretKey generate() {
        try {
            KeyGenerator generator = KeyGenerator.getInstance("AES");
            generator.init(256);
            return generator.generateKey();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}


# platform-common/src/main/java/com/hotelbooking/common/privacy/Masking.java
package com.hotelbooking.common.privacy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;

/** Masking and pseudonymisation helpers (story 9.1, AQPI-28). */
public final class Masking {

    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern CARD = Pattern.compile("\\b(?:\\d[ -]?){12,18}\\d\\b");

    private Masking() {
    }

    /** {@code jane.doe@example.com} becomes {@code j***@e***.com}. */
    public static String email(String email) {
        if (email == null || !email.contains("@")) {
            return "***";
        }
        String[] parts = email.split("@", 2);
        String domain = parts[1];
        int dot = domain.lastIndexOf('.');
        String tld = dot >= 0 ? domain.substring(dot) : "";
        return first(parts[0]) + "***@" + first(domain) + "***" + tld;
    }

    public static String phone(String phone) {
        if (phone == null) {
            return null;
        }
        String digits = phone.replaceAll("\\D", "");
        return digits.length() <= 2 ? "***" : "***" + digits.substring(digits.length() - 2);
    }

    /** Removes e-mail addresses and card-like numbers from free text before it reaches a log. */
    public static String scrub(String text) {
        if (text == null) {
            return null;
        }
        return CARD.matcher(EMAIL.matcher(text).replaceAll("[email]")).replaceAll("[card]");
    }

    /** True when the text contains something shaped like a card number (PAN). */
    public static boolean looksLikeCard(String text) {
        return text != null && CARD.matcher(text).find();
    }

    /** Stable, non-reversible token for lookups, e.g. resend verification (story 8.3). */
    public static String fingerprint(String... values) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String v : values) {
                digest.update((v == null ? "" : v.trim().toLowerCase(Locale.ROOT)).getBytes(StandardCharsets.UTF_8));
                digest.update((byte) 0);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String first(String s) {
        return s.isEmpty() ? "" : s.substring(0, 1);
    }
}


# platform-common/src/main/java/com/hotelbooking/common/resilience/DependencyCalls.java
package com.hotelbooking.common.resilience;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.TimeoutException;

import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.reactor.circuitbreaker.operator.CircuitBreakerOperator;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

/**
 * Timeout, retry and circuit breaker around every downstream call, with latency metrics (story 9.4, AQPI-31).
 * Only transient failures are retried, and only when the caller marks the call idempotent.
 */
public class DependencyCalls {

    private final Map<String, PlatformProperties.Policy> policies;
    private final PlatformProperties.Policy defaults;
    private final CircuitBreakerRegistry breakers;
    private final MeterRegistry meters;

    public DependencyCalls(PlatformProperties properties, CircuitBreakerRegistry breakers, MeterRegistry meters) {
        this.policies = properties.getDependencies();
        this.defaults = new PlatformProperties.Policy();
        this.breakers = breakers;
        this.meters = meters;
    }

    public <T> Mono<T> call(String dependency, boolean idempotent, Mono<T> call) {
        PlatformProperties.Policy policy = policies.getOrDefault(dependency, defaults);
        CircuitBreaker breaker = breakers.circuitBreaker(dependency);
        int retries = idempotent ? policy.getRetries() : 0;
        return Mono.defer(() -> {
            long start = System.nanoTime();
            return call
                    .timeout(policy.getTimeout())
                    .retryWhen(Retry.backoff(retries, policy.getBackoff()).filter(DependencyCalls::transientFailure)
                            .onRetryExhaustedThrow((spec, signal) -> signal.failure()))
                    .transformDeferred(CircuitBreakerOperator.of(breaker))
                    .doOnSuccess(v -> time(dependency, "success", start))
                    .doOnError(e -> time(dependency, "failure", start))
                    .onErrorMap(DependencyCalls::unavailable, e -> new DependencyUnavailableException(dependency, category(e), e));
        });
    }

    private void time(String dependency, String outcome, long start) {
        Timer.builder("booking.dependency.latency").tag("dependency", dependency).tag("outcome", outcome)
                .register(meters).record(Duration.ofNanos(System.nanoTime() - start));
    }

    public static boolean transientFailure(Throwable e) {
        return e instanceof TimeoutException || e instanceof WebClientRequestException
                || (e instanceof WebClientResponseException r && r.getStatusCode().is5xxServerError());
    }

    private static boolean unavailable(Throwable e) {
        return transientFailure(e) || e instanceof CallNotPermittedException;
    }

    private static DependencyUnavailableException.Category category(Throwable e) {
        if (e instanceof CallNotPermittedException) {
            return DependencyUnavailableException.Category.CIRCUIT_OPEN;
        }
        return e instanceof TimeoutException ? DependencyUnavailableException.Category.TIMEOUT
                : DependencyUnavailableException.Category.UNAVAILABLE;
    }
}


# platform-common/src/main/java/com/hotelbooking/common/resilience/DependencyUnavailableException.java
package com.hotelbooking.common.resilience;

/** A downstream service timed out, failed with 5xx, could not be reached, or its circuit is open. */
public class DependencyUnavailableException extends RuntimeException {

    public enum Category {
        TIMEOUT,
        UNAVAILABLE,
        CIRCUIT_OPEN
    }

    private final String dependency;
    private final Category category;

    public DependencyUnavailableException(String dependency, Category category, Throwable cause) {
        super(dependency + " " + category, cause);
        this.dependency = dependency;
        this.category = category;
    }

    public String dependency() {
        return dependency;
    }

    public Category category() {
        return category;
    }
}


# platform-common/src/main/java/com/hotelbooking/common/resilience/PlatformProperties.java
package com.hotelbooking.common.resilience;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code platform.*}: environment code, service name and per-dependency timeout/retry policy (story 9.4). */
@ConfigurationProperties("platform")
public class PlatformProperties {

    private String environment = "local";
    private String service = "unknown";
    private String dataKey;
    private Map<String, Policy> dependencies = new HashMap<>();

    /** Base64 AES-256 key for personal fields at rest; a random key is generated when unset (demo only). */
    public String getDataKey() {
        return dataKey;
    }

    public void setDataKey(String dataKey) {
        this.dataKey = dataKey;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public String getService() {
        return service;
    }

    public void setService(String service) {
        this.service = service;
    }

    public Map<String, Policy> getDependencies() {
        return dependencies;
    }

    public void setDependencies(Map<String, Policy> dependencies) {
        this.dependencies = dependencies;
    }

    public static class Policy {

        private String baseUrl;
        private Duration timeout = Duration.ofSeconds(2);
        private int retries = 1;
        private Duration backoff = Duration.ofMillis(50);

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(Duration timeout) {
            this.timeout = timeout;
        }

        public int getRetries() {
            return retries;
        }

        public void setRetries(int retries) {
            this.retries = retries;
        }

        public Duration getBackoff() {
            return backoff;
        }

        public void setBackoff(Duration backoff) {
            this.backoff = backoff;
        }
    }
}


# platform-common/src/main/java/com/hotelbooking/common/web/ApiError.java
package com.hotelbooking.common.web;

import java.util.List;

/**
 * Error body used by every service. {@code message} is plain language for the guest; {@code code} is for
 * clients and support; {@code retryable} tells the UI whether offering "Try again" is safe.
 */
public record ApiError(int status, String code, String message, String correlationId, boolean retryable,
        List<FieldIssue> fieldIssues) {
}


# platform-common/src/main/java/com/hotelbooking/common/web/ApiException.java
package com.hotelbooking.common.web;

import java.util.List;

import org.springframework.http.HttpStatus;

/** Business error with a guest-facing message. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final boolean retryable;
    private final List<FieldIssue> fieldIssues;

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, false, List.of());
    }

    public ApiException(HttpStatus status, String code, String message, boolean retryable, List<FieldIssue> fieldIssues) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryable = retryable;
        this.fieldIssues = List.copyOf(fieldIssues);
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public boolean retryable() {
        return retryable;
    }

    public List<FieldIssue> fieldIssues() {
        return fieldIssues;
    }
}


# platform-common/src/main/java/com/hotelbooking/common/web/CorrelationId.java
package com.hotelbooking.common.web;

import java.util.UUID;
import java.util.regex.Pattern;

import reactor.core.publisher.Mono;
import reactor.util.context.ContextView;

/** Correlation ID shared by every service in the booking journey (story 9.2, AQPI-29). */
public final class CorrelationId {

    public static final String HEADER = "X-Correlation-Id";
    public static final String CONTEXT_KEY = "correlationId";

    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9._-]{8,64}");

    private CorrelationId() {
    }

    public static String sanitizeOrCreate(String candidate) {
        return candidate != null && SAFE.matcher(candidate).matches() ? candidate : UUID.randomUUID().toString();
    }

    public static String from(ContextView context) {
        return context.getOrDefault(CONTEXT_KEY, "none");
    }

    public static Mono<String> current() {
        return Mono.deferContextual(ctx -> Mono.just(from(ctx)));
    }
}


# platform-common/src/main/java/com/hotelbooking/common/web/CorrelationIdWebFilter.java
package com.hotelbooking.common.web;

import org.springframework.core.Ordered;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import reactor.core.publisher.Mono;

/** Accepts or creates the correlation ID, returns it on the response and puts it in the Reactor context. */
public class CorrelationIdWebFilter implements WebFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String id = CorrelationId.sanitizeOrCreate(exchange.getRequest().getHeaders().getFirst(CorrelationId.HEADER));
        exchange.getAttributes().put(CorrelationId.CONTEXT_KEY, id);
        exchange.getResponse().getHeaders().set(CorrelationId.HEADER, id);
        return chain.filter(exchange).contextWrite(ctx -> ctx.put(CorrelationId.CONTEXT_KEY, id));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}


# platform-common/src/main/java/com/hotelbooking/common/web/CorrelationPropagation.java
package com.hotelbooking.common.web;

import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ExchangeFilterFunction;

import reactor.core.publisher.Mono;

/** Forwards the caller's correlation ID on every outbound WebClient call. */
public final class CorrelationPropagation {

    private CorrelationPropagation() {
    }

    public static ExchangeFilterFunction filter() {
        return (request, next) -> Mono.deferContextual(ctx -> next.exchange(
                ClientRequest.from(request).header(CorrelationId.HEADER, CorrelationId.from(ctx)).build()));
    }
}


# platform-common/src/main/java/com/hotelbooking/common/web/DownstreamErrors.java
package com.hotelbooking.common.web;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClientResponseException;

/** Turns a downstream 4xx {@link ApiError} into a local {@link ApiException} with the same code and message. */
public final class DownstreamErrors {

    private DownstreamErrors() {
    }

    public static Throwable translate(Throwable error) {
        if (error instanceof WebClientResponseException e && e.getStatusCode().is4xxClientError()) {
            ApiError body = null;
            try {
                body = e.getResponseBodyAs(ApiError.class);
            } catch (RuntimeException ignored) {
                // body is not an ApiError; fall back to the status alone
            }
            HttpStatus status = HttpStatus.valueOf(e.getStatusCode().value());
            return body == null ? new ApiException(status, status.name(), status.getReasonPhrase())
                    : new ApiException(status, body.code(), body.message(), body.retryable(),
                            body.fieldIssues() == null ? List.of() : body.fieldIssues());
        }
        return error;
    }
}


# platform-common/src/main/java/com/hotelbooking/common/web/FieldIssue.java
package com.hotelbooking.common.web;

/** A field-level problem written for the guest, plus the rule that raised it (stories 3.1, 3.2, 7.1). */
public record FieldIssue(String field, String ruleId, String message) {
}


# platform-common/src/main/java/com/hotelbooking/common/web/GlobalErrorHandler.java
package com.hotelbooking.common.web;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.ServerWebInputException;

import com.hotelbooking.common.resilience.DependencyUnavailableException;

/** Maps every failure to {@link ApiError}; never echoes request payloads (story 9.1). */
@RestControllerAdvice
public class GlobalErrorHandler {

    private static final Logger LOG = LoggerFactory.getLogger(GlobalErrorHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> api(ApiException e, ServerWebExchange exchange) {
        return body(e.status(), e.code(), e.getMessage(), e.retryable(), e.fieldIssues(), exchange);
    }

    @ExceptionHandler(WebExchangeBindException.class)
    ResponseEntity<ApiError> validation(WebExchangeBindException e, ServerWebExchange exchange) {
        List<FieldIssue> issues = e.getFieldErrors().stream()
                .map(f -> new FieldIssue(f.getField(), "field." + f.getCode(), f.getDefaultMessage()))
                .toList();
        return body(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Some details need correcting before we can continue.",
                false, issues, exchange);
    }

    @ExceptionHandler(ServerWebInputException.class)
    ResponseEntity<ApiError> input(ServerWebInputException e, ServerWebExchange exchange) {
        return body(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                "We couldn't read that request. Check the details and try again.", false, List.of(), exchange);
    }

    @ExceptionHandler(DependencyUnavailableException.class)
    ResponseEntity<ApiError> dependency(DependencyUnavailableException e, ServerWebExchange exchange) {
        LOG.warn("dependency={} category={} correlationId={}", e.dependency(), e.category(),
                exchange.getAttribute(CorrelationId.CONTEXT_KEY));
        return body(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_TEMPORARILY_UNAVAILABLE",
                "Something went wrong on our side. Please try again in a moment.", true, List.of(), exchange);
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiError> status(ResponseStatusException e, ServerWebExchange exchange) {
        HttpStatus status = HttpStatus.valueOf(e.getStatusCode().value());
        return body(status, status.name(), e.getReason() == null ? status.getReasonPhrase() : e.getReason(), false,
                List.of(), exchange);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception e, ServerWebExchange exchange) {
        LOG.error("unexpected error type={} correlationId={}", e.getClass().getSimpleName(),
                exchange.getAttribute(CorrelationId.CONTEXT_KEY));
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "UNEXPECTED_ERROR",
                "Something went wrong on our side. Please try again in a moment.", true, List.of(), exchange);
    }

    private static ResponseEntity<ApiError> body(HttpStatus status, String code, String message, boolean retryable,
            List<FieldIssue> issues, ServerWebExchange exchange) {
        String id = exchange.getAttribute(CorrelationId.CONTEXT_KEY);
        return ResponseEntity.status(status).body(new ApiError(status.value(), code, message, id, retryable, issues));
    }
}


# README.md
# Hotel booking platform (AQPI)

Java 21 + Spring Boot 3.5 + WebFlux reactive microservices for the "Intelligent Hotel Shopping and Reservation Experience" initiative (Jira AQPI-1). Every story AQPI-3 to AQPI-31 is mapped to code and tests in [TRACEABILITY.md](TRACEABILITY.md).

| Module | Port | Epic | What it does |
|---|---|---|---|
| platform-common | - | AQPI-27 | Correlation IDs, masking, AES-GCM field encryption, versioned business events, timeouts/retries/circuit breakers, money, error contract |
| hotel-service | 8081 | AQPI-6 | Hotel catalog, availability, sort/filter/paging, details, quotes, inventory commitments |
| search-service | 8082 | AQPI-2 | Search validation, session-idempotent searches, no-availability suggestions, dependency fallback |
| offer-service | 8083 | AQPI-10 | Eligible ancillary offers, consent-aware personalisation, dismissals, cart validation |
| cart-service | 8084 | AQPI-14 | Cart with 30-minute expiry, optional extras, revalidation, price-change acknowledgement |
| reservation-service | 8085 | AQPI-18 | Guest validation, tokenised payment, idempotent reservation, reconciliation, manual review, privacy views |
| notification-service | 8086 | AQPI-23 | Accessible localised confirmation e-mail, delivery tracking, retry, safe resend |
| journey-tests | - | all | Starts all six services in one JVM and runs end-to-end booking journeys |

## Build and test

```bash
export JAVA_HOME=/path/to/jdk-21
mvn -B install            # all modules, 49 tests
mvn -B -pl journey-tests -am test   # end-to-end journeys only
```

Run a service: `mvn -pl hotel-service -am spring-boot:run` (start hotel, offer and notification first, then search, cart and reservation).

## Business rules

The rules this code enforces are tagged `@rule [AQPI-n]` next to their configured values in each service's `src/main/resources/<service>.yml`; the key names the Jira story the rule implements. The booking attributes, their types, limits and example values are in [data-dictionary/booking-attributes.json](data-dictionary/booking-attributes.json); test data is generated from it.

## Demo switches

- Payment tokens: `tok_visa_ok` authorises, `tok_decline` declines, `tok_error` fails, `tok_timeout` loses the response (reservation goes to PENDING_UNKNOWN and is reconciled), `tok_void_fails` makes a void fail (MANUAL_REVIEW).
- E-mail domains: `@fail.test` always fails, `@flaky.test` fails once then succeeds, `@bounce.test` bounces.
- `POST /api/admin/reset` on each service restores the seeded data.

## Limitations

- Storage is in memory; restarting a service loses its data.
- Payment and e-mail providers are simulated.
- No browser UI: accessibility is covered for the search form contract and the e-mail template only.
- Load and performance targets (AQPI-31) are not measured; timeouts, retries and fallbacks are tested.
- Built and tested on Java 21. The code uses no Java 22+ features; Java 25 has not been tested.


# reservation-service/src/main/java/com/hotelbooking/reservation/Downstream.java
package com.hotelbooking.reservation;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import com.hotelbooking.common.PlatformAutoConfiguration;
import com.hotelbooking.common.resilience.DependencyCalls;
import com.hotelbooking.common.resilience.PlatformProperties;
import com.hotelbooking.common.web.DownstreamErrors;
import com.hotelbooking.reservation.ReservationApi.CartSnapshot;
import com.hotelbooking.reservation.ReservationApi.CommitmentRequest;
import com.hotelbooking.reservation.ReservationApi.CompleteRequest;
import com.hotelbooking.reservation.ReservationApi.ConfirmationRequest;
import com.hotelbooking.reservation.ReservationApi.MessageStatus;

import reactor.core.publisher.Mono;

/** Cart checkout, inventory commitment and confirmation requests. All are safe to retry by design. */
@Component
public class Downstream {

    public static final String CART = "cart-service";
    public static final String HOTEL = "hotel-service";
    public static final String NOTIFICATION = "notification-service";

    private final WebClient cart;
    private final WebClient hotel;
    private final WebClient notification;
    private final DependencyCalls calls;

    public Downstream(WebClient.Builder builder, PlatformProperties properties, DependencyCalls calls) {
        this.cart = PlatformAutoConfiguration.client(builder, properties, CART);
        this.hotel = PlatformAutoConfiguration.client(builder, properties, HOTEL);
        this.notification = PlatformAutoConfiguration.client(builder, properties, NOTIFICATION);
        this.calls = calls;
    }

    public Mono<CartSnapshot> checkout(String cartId) {
        return calls.call(CART, true, cart.post().uri("/api/carts/{id}/checkout", cartId).retrieve()
                .bodyToMono(CartSnapshot.class)).onErrorMap(DownstreamErrors::translate);
    }

    public Mono<Void> completeCart(String cartId, String reservationId) {
        return calls.call(CART, true, cart.post().uri("/api/carts/{id}/complete", cartId)
                .bodyValue(new CompleteRequest(reservationId)).retrieve().bodyToMono(Void.class))
                .onErrorMap(DownstreamErrors::translate);
    }

    public Mono<Void> commit(CommitmentRequest request) {
        return calls.call(HOTEL, true, hotel.post().uri("/api/inventory/commitments").bodyValue(request).retrieve()
                .bodyToMono(Void.class)).onErrorMap(DownstreamErrors::translate);
    }

    public Mono<Void> release(String reference) {
        return calls.call(HOTEL, true, hotel.delete().uri("/api/inventory/commitments/{ref}", reference).retrieve()
                .bodyToMono(Void.class)).onErrorMap(DownstreamErrors::translate);
    }

    public Mono<MessageStatus> requestConfirmation(ConfirmationRequest request) {
        return calls.call(NOTIFICATION, true, notification.post().uri("/api/confirmations").bodyValue(request)
                .retrieve().bodyToMono(MessageStatus.class)).onErrorMap(DownstreamErrors::translate);
    }

    public Mono<MessageStatus> requestCancellationEmail(ConfirmationRequest request) {
        return calls.call(NOTIFICATION, true, notification.post().uri("/api/cancellations").bodyValue(request)
                .retrieve().bodyToMono(MessageStatus.class)).onErrorMap(DownstreamErrors::translate);
    }
}


# reservation-service/src/main/java/com/hotelbooking/reservation/GuestValidator.java
package com.hotelbooking.reservation;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.hotelbooking.common.privacy.Masking;
import com.hotelbooking.common.web.FieldIssue;
import com.hotelbooking.reservation.ReservationApi.Guest;
import com.hotelbooking.reservation.ReservationApi.ReservationRequest;

/** Stories 7.1 and 7.2: field-level, plain-language validation; card numbers are rejected without being echoed. */
@Component
public class GuestValidator {

    private static final Pattern NAME = Pattern.compile("[\\p{L}][\\p{L} .'-]{0,49}");
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern PHONE = Pattern.compile("\\+?[0-9 ()-]{7,20}");
    private static final Pattern TIME = Pattern.compile("([01][0-9]|2[0-3]):[0-5][0-9]");
    private static final Pattern TOKEN = Pattern.compile("tok_[a-z0-9_]{3,40}");
    private static final int MAX_REQUESTS = 250;

    public List<FieldIssue> validate(ReservationRequest r) {
        List<FieldIssue> issues = new ArrayList<>();
        if (r.cartId() == null || r.cartId().isBlank()) {
            issues.add(new FieldIssue("cartId", "CART_REQUIRED", "Your cart is missing. Please select your room again."));
        }
        Guest g = r.guest();
        if (g == null) {
            issues.add(new FieldIssue("guest", "GUEST_REQUIRED", "Enter the lead guest's details."));
        } else {
            name(issues, "guest.firstName", g.firstName(), "first name");
            name(issues, "guest.lastName", g.lastName(), "last name");
            if (blank(g.email())) {
                issues.add(new FieldIssue("guest.email", "EMAIL_REQUIRED", "Enter an e-mail address for your confirmation."));
            } else if (!EMAIL.matcher(g.email().trim()).matches()) {
                issues.add(new FieldIssue("guest.email", "EMAIL_FORMAT", "Enter an e-mail address like name@example.com."));
            }
            if (!blank(g.phone()) && !PHONE.matcher(g.phone().trim()).matches()) {
                issues.add(new FieldIssue("guest.phone", "PHONE_FORMAT", "Enter a phone number using digits, spaces and an optional +."));
            }
            if (!blank(g.arrivalTime()) && !TIME.matcher(g.arrivalTime().trim()).matches()) {
                issues.add(new FieldIssue("guest.arrivalTime", "ARRIVAL_TIME_FORMAT", "Enter an arrival time like 15:30."));
            }
            if (!blank(g.specialRequests())) {
                if (g.specialRequests().length() > MAX_REQUESTS) {
                    issues.add(new FieldIssue("guest.specialRequests", "REQUESTS_TOO_LONG",
                            "Special requests must be " + MAX_REQUESTS + " characters or fewer."));
                }
                if (Masking.looksLikeCard(g.specialRequests())) {
                    issues.add(new FieldIssue("guest.specialRequests", "CARD_DATA_NOT_ALLOWED",
                            "Please don't enter card numbers here. Card details go only in the secure payment field."));
                }
            }
        }
        if (blank(r.paymentToken())) {
            issues.add(new FieldIssue("paymentToken", "PAYMENT_REQUIRED", "Enter your card in the secure payment field."));
        } else if (Masking.looksLikeCard(r.paymentToken())) {
            issues.add(new FieldIssue("paymentToken", "RAW_CARD_REJECTED",
                    "Card numbers can't be sent directly. Please use the secure payment field."));
        } else if (!TOKEN.matcher(r.paymentToken()).matches()) {
            issues.add(new FieldIssue("paymentToken", "PAYMENT_TOKEN_INVALID",
                    "We couldn't read your payment details. Please re-enter your card in the secure payment field."));
        }
        if (!r.privacyNoticeAccepted()) {
            issues.add(new FieldIssue("privacyNoticeAccepted", "PRIVACY_NOTICE_REQUIRED",
                    "Please confirm you have read the privacy notice."));
        }
        return issues;
    }

    private static void name(List<FieldIssue> issues, String field, String value, String label) {
        if (blank(value)) {
            issues.add(new FieldIssue(field, "NAME_REQUIRED", "Enter the lead guest's " + label + "."));
        } else if (!NAME.matcher(value.trim()).matches()) {
            issues.add(new FieldIssue(field, "NAME_FORMAT", "The " + label + " can contain letters, spaces, hyphens and apostrophes (up to 50)."));
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}


# reservation-service/src/main/java/com/hotelbooking/reservation/PaymentGateway.java
package com.hotelbooking.reservation;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.stereotype.Component;

import com.hotelbooking.common.money.Money;

/**
 * Simulated payment provider, idempotent by key. Test tokens: {@code tok_decline} declines, {@code tok_error}
 * fails before authorising, {@code tok_timeout} authorises but the response is lost, {@code tok_void_fails} cannot
 * be voided. Any other token authorises.
 */
@Component
public class PaymentGateway {

    public enum Result {
        AUTHORIZED,
        DECLINED,
        ERROR,
        TIMEOUT
    }

    public record Authorization(String key, String authorizationId, Result result, Money amount, String mode,
            boolean voided) {
    }

    private final Map<String, Authorization> ledger = new ConcurrentHashMap<>();
    private final Map<String, Boolean> nonVoidable = new ConcurrentHashMap<>();
    private final AtomicInteger calls = new AtomicInteger();

    public Authorization authorize(String key, String token, Money amount, String mode) {
        calls.incrementAndGet();
        Authorization existing = ledger.get(key);
        if (existing != null) {
            return existing.result() == Result.TIMEOUT ? withResult(existing, Result.AUTHORIZED) : existing;
        }
        Result result = switch (token) {
            case "tok_decline" -> Result.DECLINED;
            case "tok_error" -> Result.ERROR;
            case "tok_timeout" -> Result.TIMEOUT;
            default -> Result.AUTHORIZED;
        };
        if (result == Result.ERROR) {
            return new Authorization(key, null, Result.ERROR, amount, mode, false);
        }
        String id = result == Result.DECLINED ? null : "auth_" + UUID.randomUUID().toString().substring(0, 12);
        Authorization recorded = new Authorization(key, id, result, amount, mode, false);
        ledger.put(key, recorded);
        if (token.equals("tok_void_fails")) {
            nonVoidable.put(key, Boolean.TRUE);
        }
        return recorded;
    }

    /** Reconciliation lookup after a lost response. */
    public Optional<Authorization> lookup(String key) {
        return Optional.ofNullable(ledger.get(key)).map(a -> a.result() == Result.TIMEOUT ? withResult(a, Result.AUTHORIZED) : a);
    }

    public boolean voidAuthorization(String key) {
        Authorization a = ledger.get(key);
        if (a == null || nonVoidable.containsKey(key)) {
            return false;
        }
        ledger.put(key, new Authorization(a.key(), a.authorizationId(), a.result(), a.amount(), a.mode(), true));
        return true;
    }

    public List<Authorization> ledger() {
        return List.copyOf(ledger.values());
    }

    public int calls() {
        return calls.get();
    }

    public void reset() {
        ledger.clear();
        nonVoidable.clear();
        calls.set(0);
    }


    private static Authorization withResult(Authorization a, Result r) {
        return new Authorization(a.key(), a.authorizationId(), r, a.amount(), a.mode(), a.voided());
    }
}


# reservation-service/src/main/java/com/hotelbooking/reservation/Reservation.java
package com.hotelbooking.reservation;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.hotelbooking.common.money.Money;
import com.hotelbooking.reservation.ReservationApi.CartSnapshot;
import com.hotelbooking.reservation.ReservationApi.InventoryStatus;
import com.hotelbooking.reservation.ReservationApi.PaymentStatus;
import com.hotelbooking.reservation.ReservationApi.Status;

/** Reservation record. Personal fields are stored AES-GCM sealed; no card data is ever held. */
final class Reservation {

    final String id;
    final String idempotencyKey;
    final String fingerprint;
    final String cartId;
    final Instant createdAt;
    final List<String> history = new ArrayList<>();
    Status status = Status.PROCESSING;
    PaymentStatus paymentStatus = PaymentStatus.NOT_ATTEMPTED;
    InventoryStatus inventoryStatus = InventoryStatus.NOT_COMMITTED;
    String confirmationNumber;
    CartSnapshot cart;
    Money authorizedAmount;
    String paymentToken;
    String firstNameSealed;
    String lastNameSealed;
    String emailSealed;
    String phoneSealed;
    String locale;
    boolean marketingOptIn;
    String privacyNoticeVersion;
    String notificationStatus = "NOT_REQUESTED";
    String failureCode;
    boolean anonymized;
    Instant updatedAt;

    Reservation(String id, String idempotencyKey, String fingerprint, String cartId, Instant createdAt) {
        this.id = id;
        this.idempotencyKey = idempotencyKey;
        this.fingerprint = fingerprint;
        this.cartId = cartId;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }
}


# reservation-service/src/main/java/com/hotelbooking/reservation/ReservationApi.java
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
        MANUAL_REVIEW,
        CANCELLED
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

    /** Story 7.4: the outcome page. No confirmation number unless the reservation is confirmed. */
    public record Outcome(String reservationId, Status status, String confirmationNumber, String headline,
            String message, boolean doNotResubmit, List<String> nextSteps, String statusUrl, String hotelName,
            String roomName, String ratePlanName, LocalDate checkIn, LocalDate checkOut, long nights, int rooms,
            int adults, int children, List<Item> items, Money total, String paymentRule, PaymentStatus paymentStatus,
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
            List<Item> items, Money total, String paymentRule, String cancellationTerms, Boolean refundable) {
    }

    public record MessageStatus(String messageId, String status) {
    }
}


# reservation-service/src/main/java/com/hotelbooking/reservation/ReservationController.java
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

    /** Story 7.4: outcome from the system of record. */
    @GetMapping("/reservations/{id}")
    public Mono<Outcome> view(@PathVariable String id) {
        return reservations.view(id);
    }

    /** Story 10.4 (AQPI-36): free cancellation; 409 once the window has closed or the rate is non-refundable. */
    @PostMapping("/reservations/{id}/cancel")
    public Mono<Outcome> cancel(@PathVariable String id) {
        return reservations.cancel(id);
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


# reservation-service/src/main/java/com/hotelbooking/reservation/ReservationProperties.java
package com.hotelbooking.reservation;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("platform.reservation")
public class ReservationProperties {

    private Duration idempotencyTtl = Duration.ofHours(24);
    private int retentionDays = 365;
    private String privacyNoticeVersion = "privacy-2026-09";
    private Duration freeCancellationWindow = Duration.ofHours(48);

    public Duration getIdempotencyTtl() {
        return idempotencyTtl;
    }

    public void setIdempotencyTtl(Duration idempotencyTtl) {
        this.idempotencyTtl = idempotencyTtl;
    }

    public int getRetentionDays() {
        return retentionDays;
    }

    public void setRetentionDays(int retentionDays) {
        this.retentionDays = retentionDays;
    }

    public String getPrivacyNoticeVersion() {
        return privacyNoticeVersion;
    }

    public void setPrivacyNoticeVersion(String privacyNoticeVersion) {
        this.privacyNoticeVersion = privacyNoticeVersion;
    }

    public Duration getFreeCancellationWindow() {
        return freeCancellationWindow;
    }

    public void setFreeCancellationWindow(Duration freeCancellationWindow) {
        this.freeCancellationWindow = freeCancellationWindow;
    }
}


# reservation-service/src/main/java/com/hotelbooking/reservation/ReservationService.java
package com.hotelbooking.reservation;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
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

/** Stories 7.1-7.4 (AQPI-19..22), free cancellation 10.4 (AQPI-36) and the reservation side of 9.1 (AQPI-28). */
@Service
public class ReservationService {

    public static final String PAY_NOW = "PAY_NOW";
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._-]{8,64}");
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

    /** Story 7.3 AC4 / 7.4 AC2: resolve PENDING_UNKNOWN and inventory-unknown MANUAL_REVIEW cases. */
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

    /** Story 10.4 (AQPI-36): a refundable booking is cancelled free of charge until the window before check-in closes. */
    public Mono<Outcome> cancel(String reservationId) {
        Reservation r = find(reservationId);
        synchronized (r) {
            if (r.status == Status.CANCELLED) {
                return Mono.just(outcome(r));
            }
            if (r.status != Status.CONFIRMED) {
                return refuseCancellation(r, "RESERVATION_NOT_CANCELLABLE", "Only a confirmed booking can be cancelled.");
            }
            if (!r.cart.room().refundable()) {
                return refuseCancellation(r, "NON_REFUNDABLE_RATE",
                        "This rate is non-refundable, so it can't be cancelled free of charge. Your booking is still confirmed.");
            }
            Instant deadline = r.cart.room().checkIn().atStartOfDay(ZoneOffset.UTC).toInstant()
                    .minus(properties.getFreeCancellationWindow());
            if (clock.instant().isAfter(deadline)) {
                return refuseCancellation(r, "FREE_CANCELLATION_CLOSED", "Free cancellation closed "
                        + properties.getFreeCancellationWindow().toHours()
                        + " hours before check-in. Your booking is still confirmed.");
            }
        }
        return downstream.release(r.id).then(Mono.defer(() -> {
            r.inventoryStatus = InventoryStatus.RELEASED;
            note(r, "rooms released for cancellation");
            if (gateway.voidAuthorization(r.idempotencyKey)) {
                r.paymentStatus = PaymentStatus.VOIDED;
                return finish(r, Status.CANCELLED, null).then(cancellationEmail(r));
            }
            return finish(r, Status.MANUAL_REVIEW, "VOID_FAILED");
        })).then(events.event(EventNames.CANCELLATION_REQUESTED).outcome("cancelled").attr("reservationId", r.id)
                .publish()).then(Mono.fromSupplier(() -> outcome(r)));
    }

    private Mono<Outcome> refuseCancellation(Reservation r, String code, String message) {
        return events.event(EventNames.CANCELLATION_REQUESTED).outcome(code.toLowerCase(Locale.ROOT))
                .attr("reservationId", r.id).publish()
                .then(Mono.error(new ApiException(HttpStatus.CONFLICT, code, message)));
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
                case PAYMENT_DECLINED, FAILED, CANCELLED -> !heldAtProvider && r.inventoryStatus != InventoryStatus.COMMITTED;
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
        Mono<Void> notify = downstream.requestConfirmation(notice(r, Status.CONFIRMED))
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

    /** Story 8.4 (release 2.0): the guest is told about the cancellation; a failed e-mail never undoes it. */
    private Mono<Void> cancellationEmail(Reservation r) {
        return Mono.defer(() -> downstream.requestCancellationEmail(notice(r, Status.CANCELLED)))
                .doOnNext(m -> note(r, "cancellation e-mail " + m.messageId() + " " + m.status()))
                .onErrorResume(e -> Mono.fromRunnable(() -> note(r, "cancellation e-mail request failed; booking stays cancelled")))
                .then();
    }

    private ConfirmationRequest notice(Reservation r, Status status) {
        CartRoom room = r.cart.room();
        return new ConfirmationRequest(r.id, r.confirmationNumber, status.name(), r.locale,
                open(r.firstNameSealed), open(r.lastNameSealed), open(r.emailSealed),
                new HotelInfo(room.hotelName(), room.address(), room.city(), room.checkInFrom(), room.checkOutUntil()),
                room.checkIn(), room.checkOut(), room.nights(), room.rooms(), room.adults(), room.children(),
                room.roomName(), room.ratePlanName(), items(r), r.cart.totals().total(), room.paymentRule(),
                room.cancellationTerms(), room.refundable());
    }

    Outcome outcome(Reservation r) {
        synchronized (r) {
            String headline;
            String message;
            boolean doNotResubmit;
            List<String> next;
            switch (r.status) {
                case CONFIRMED -> {
                    headline = "Your booking is confirmed";
                    message = "Your confirmation number is " + r.confirmationNumber + ". We've sent the details to your e-mail.";
                    doNotResubmit = true;
                    next = List.of("Save your confirmation number", "Check your e-mail for the confirmation",
                            "Contact the hotel for special requests");
                }
                case PAYMENT_DECLINED -> {
                    headline = "Your payment was declined";
                    message = "Your bank declined the payment. You have not been charged and no booking was made.";
                    doNotResubmit = false;
                    next = List.of("Try a different card", "Contact your bank if the problem continues");
                }
                case FAILED -> {
                    headline = "Your booking was not completed";
                    message = "ROOM_UNAVAILABLE".equals(r.failureCode)
                            ? "The room became unavailable while we were booking it. Any payment hold has been released."
                            : "We couldn't complete the payment step. You have not been charged and no booking was made.";
                    doNotResubmit = false;
                    next = "ROOM_UNAVAILABLE".equals(r.failureCode) ? List.of("Search again for other rooms or dates")
                            : List.of("Try again in a few minutes");
                }
                case CANCELLED -> {
                    headline = "Your booking is cancelled";
                    message = "Your booking was cancelled free of charge. Any payment hold has been released.";
                    doNotResubmit = false;
                    next = List.of("Search again to book new dates");
                }
                case PENDING_UNKNOWN -> {
                    headline = "We're confirming your booking";
                    message = "Please don't book again. We'll update this page and e-mail you as soon as it's confirmed.";
                    doNotResubmit = true;
                    next = List.of("Check this page again in a few minutes");
                }
                case MANUAL_REVIEW -> {
                    headline = "Your booking is being checked";
                    message = "Our team is checking your booking. You will not be charged twice, and we'll e-mail you with the result.";
                    doNotResubmit = true;
                    next = List.of("Keep this reference: " + r.id, "Check this page again later");
                }
                default -> {
                    headline = "Your booking is being processed";
                    message = "Please wait and don't submit again.";
                    doNotResubmit = true;
                    next = List.of("Check this page again in a moment");
                }
            }
            CartRoom room = r.cart == null ? null : r.cart.room();
            return new Outcome(r.id, r.status, r.status == Status.CONFIRMED ? r.confirmationNumber : null, headline, message,
                    doNotResubmit, next, "/api/reservations/" + r.id,
                    room == null ? null : room.hotelName(), room == null ? null : room.roomName(),
                    room == null ? null : room.ratePlanName(), room == null ? null : room.checkIn(),
                    room == null ? null : room.checkOut(), room == null ? 0 : room.nights(),
                    room == null ? 0 : room.rooms(), room == null ? 0 : room.adults(), room == null ? 0 : room.children(),
                    r.cart == null ? List.of() : items(r), r.cart == null ? null : r.cart.totals().total(),
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


# reservation-service/src/main/java/com/hotelbooking/reservation/ReservationServiceApplication.java
package com.hotelbooking.reservation;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/** Epic 5 (AQPI-18): guest details, payment authorisation, idempotent reservation and booking outcome. */
@SpringBootApplication
@EnableConfigurationProperties(ReservationProperties.class)
public class ReservationServiceApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(ReservationServiceApplication.class)
                .properties("spring.config.name=reservation-service").run(args);
    }
}


# reservation-service/src/main/resources/reservation-service.yml
server:
  port: 8085
platform:
  service: reservation-service
  environment: local
  dependencies:
    cart-service:
      base-url: http://localhost:8084
      timeout: 3s
      retries: 1
    hotel-service:
      base-url: http://localhost:8081
      timeout: 2s
      retries: 1
    notification-service:
      base-url: http://localhost:8086
      timeout: 2s
      retries: 1
  reservation:
    # @rule [AQPI-21] Every reservation request needs an Idempotency-Key of 8 to 64 characters; a replay within 24 hours returns the original outcome.
    idempotency-ttl: 24h
    # @rule [AQPI-36] A confirmed reservation can be cancelled free of charge up to 48 hours before check-in; a later cancellation is refused and the reservation stays confirmed.
    # @rule [AQPI-36] A cancelled reservation shows status CANCELLED, its payment authorisation is voided and its rooms are released.
    free-cancellation-window: 48h
    retention-days: 365
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics


# search-service/src/main/java/com/hotelbooking/search/HotelClient.java
package com.hotelbooking.search;

import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriBuilder;

import com.hotelbooking.common.PlatformAutoConfiguration;
import com.hotelbooking.common.resilience.DependencyCalls;
import com.hotelbooking.common.resilience.PlatformProperties;
import com.hotelbooking.common.web.DownstreamErrors;
import com.hotelbooking.search.SearchApi.Criteria;
import com.hotelbooking.search.SearchApi.HotelPage;

import reactor.core.publisher.Mono;

/** Calls hotel-service availability through timeout, retry and circuit breaker (story 9.4). */
@Component
public class HotelClient {

    public static final String DEPENDENCY = "hotel-service";

    private final WebClient client;
    private final DependencyCalls calls;

    public HotelClient(WebClient.Builder builder, PlatformProperties properties, DependencyCalls calls) {
        this.client = PlatformAutoConfiguration.client(builder, properties, DEPENDENCY);
        this.calls = calls;
    }

    public Mono<HotelPage> availability(Criteria c, Map<String, String> refinements) {
        return calls.call(DEPENDENCY, true, client.get().uri(b -> {
            UriBuilder u = b.path("/api/hotels/availability")
                    .queryParam("destination", c.destination())
                    .queryParam("checkIn", c.checkIn())
                    .queryParam("checkOut", c.checkOut())
                    .queryParam("rooms", c.rooms())
                    .queryParam("adults", c.adults())
                    .queryParam("children", c.children());
            refinements.forEach(u::queryParam);
            return u.build();
        }).retrieve().bodyToMono(HotelPage.class)).onErrorMap(DownstreamErrors::translate);
    }
}


# search-service/src/main/java/com/hotelbooking/search/SearchApi.java
package com.hotelbooking.search;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.common.web.FieldIssue;

/** Request and response shapes for search-service. */
public final class SearchApi {

    private SearchApi() {
    }

    public enum Status {
        RESULTS,
        NO_AVAILABILITY,
        SERVICE_UNAVAILABLE
    }

    /** All fields nullable so the server can report every missing field at once (story 3.2). */
    public record SearchRequest(String destination, LocalDate checkIn, LocalDate checkOut, Integer rooms, Integer adults,
            Integer children) {
    }

    public record Criteria(String destination, LocalDate checkIn, LocalDate checkOut, int rooms, int adults, int children,
            long nights) {
    }

    public record Money(BigDecimal amount, String currency) {
    }

    /** Subset of hotel-service's result card that search exposes (story 4.1 fields). */
    public record HotelCard(String hotelId, String name, String city, double distanceKm, int category, String image,
            List<String> amenities, Money startingNightly, Money startingStayTotal, String currency, String availability,
            boolean bookable, String priceQualification) {
    }

    public record AppliedFilter(String name, String value, String removeHint) {
    }

    public record HotelPage(List<HotelCard> results, int page, int size, int totalResults, int totalPages,
            int unfilteredResults, String sort, List<String> sortOptions, List<AppliedFilter> appliedFilters,
            boolean resetAvailable, List<String> availableAmenities) {
    }

    public record Suggestion(String action, String label, SearchRequest criteria) {
    }

    /** Criteria are echoed so they stay visible and editable on the results page (story 3.1 AC2). */
    public record SearchResponse(String searchId, String sessionId, Status status, Criteria criteria, String message,
            boolean retryable, List<Suggestion> suggestions, HotelPage page) {
    }

    public record FieldSpec(String name, String label, String type, boolean required, String constraint, String hint,
            String errorId) {
    }

    /** Story 3.2 AC1, AC4: required fields are identified; errors are linked to fields for assistive technology. */
    public record FormSpec(List<FieldSpec> fields, String errorSummaryRole, String errorSummaryLive, String rulesVersion) {
    }

    public record ValidationResult(boolean valid, List<FieldIssue> fieldIssues) {
    }
}


# search-service/src/main/java/com/hotelbooking/search/SearchController.java
package com.hotelbooking.search;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.hotelbooking.search.SearchApi.FormSpec;
import com.hotelbooking.search.SearchApi.SearchRequest;
import com.hotelbooking.search.SearchApi.SearchResponse;
import com.hotelbooking.search.SearchApi.Status;
import com.hotelbooking.search.SearchApi.ValidationResult;

import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/searches")
public class SearchController {

    public static final String SESSION_HEADER = "X-Session-Id";
    private static final Set<String> REFINEMENTS = Set.of("sort", "minPrice", "maxPrice", "amenities", "minCategory",
            "maxDistanceKm", "page", "size");

    private final SearchService searches;
    private final SearchValidator validator;

    public SearchController(SearchService searches, SearchValidator validator) {
        this.searches = searches;
        this.validator = validator;
    }

    /** Stories 3.1, 3.3 (AQPI-3, AQPI-5). */
    @PostMapping
    public Mono<ResponseEntity<SearchResponse>> search(@RequestBody SearchRequest request,
            @RequestHeader(value = SESSION_HEADER, required = false) String sessionId) {
        return searches.search(request, sessionId).map(SearchController::entity);
    }

    /** Story 4.2: sort, filter and page an existing search. */
    @GetMapping("/{searchId}/results")
    public Mono<ResponseEntity<SearchResponse>> refine(@PathVariable String searchId,
            @RequestParam Map<String, String> params) {
        Map<String, String> refinements = new LinkedHashMap<>();
        params.forEach((k, v) -> {
            if (REFINEMENTS.contains(k) && v != null && !v.isBlank()) {
                refinements.put(k, v);
            }
        });
        return searches.refine(searchId, refinements).map(SearchController::entity);
    }

    /** Story 3.2 AC1: field metadata for the search form. */
    @GetMapping("/form")
    public Mono<FormSpec> form() {
        return Mono.just(validator.form());
    }

    /** Story 3.2 AC3: the same rules a client can call before submit; the search itself re-validates. */
    @PostMapping("/validate")
    public Mono<ValidationResult> validate(@RequestBody SearchRequest request) {
        return Mono.fromSupplier(() -> {
            var issues = validator.validate(request);
            return new ValidationResult(issues.isEmpty(), issues);
        });
    }

    private static ResponseEntity<SearchResponse> entity(SearchResponse r) {
        return ResponseEntity.status(r.status() == Status.SERVICE_UNAVAILABLE ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK)
                .body(r);
    }
}


# search-service/src/main/java/com/hotelbooking/search/SearchRules.java
package com.hotelbooking.search;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configurable search rules (stories 3.1 BR, 3.2 BR). Market entries override the defaults for one destination.
 */
@ConfigurationProperties("platform.search")
public class SearchRules {

    private Limits defaults = new Limits();
    private Map<String, Limits> markets = new HashMap<>();
    private List<String> destinations = List.of("NYC", "LON", "PAR");
    private Duration sessionTtl = Duration.ofMinutes(15);
    private String zone = "UTC";

    public Limits limitsFor(String destination) {
        Limits market = destination == null ? null : markets.get(destination.toUpperCase(Locale.ROOT));
        return market == null ? defaults : defaults.overriddenBy(market);
    }

    public Limits getDefaults() {
        return defaults;
    }

    public void setDefaults(Limits defaults) {
        this.defaults = defaults;
    }

    public Map<String, Limits> getMarkets() {
        return markets;
    }

    public void setMarkets(Map<String, Limits> markets) {
        this.markets = markets;
    }

    public List<String> getDestinations() {
        return destinations;
    }

    public void setDestinations(List<String> destinations) {
        this.destinations = destinations;
    }

    public Duration getSessionTtl() {
        return sessionTtl;
    }

    public void setSessionTtl(Duration sessionTtl) {
        this.sessionTtl = sessionTtl;
    }

    public String getZone() {
        return zone;
    }

    public void setZone(String zone) {
        this.zone = zone;
    }

    public static class Limits {

        private Integer maxStayNights = 30;
        private Integer maxAdvanceDays = 500;
        private Integer maxRooms = 8;
        private Integer maxAdultsPerRoom = 4;
        private Integer maxChildrenPerRoom = 3;

        Limits overriddenBy(Limits o) {
            Limits l = new Limits();
            l.maxStayNights = o.maxStayNights != null ? o.maxStayNights : maxStayNights;
            l.maxAdvanceDays = o.maxAdvanceDays != null ? o.maxAdvanceDays : maxAdvanceDays;
            l.maxRooms = o.maxRooms != null ? o.maxRooms : maxRooms;
            l.maxAdultsPerRoom = o.maxAdultsPerRoom != null ? o.maxAdultsPerRoom : maxAdultsPerRoom;
            l.maxChildrenPerRoom = o.maxChildrenPerRoom != null ? o.maxChildrenPerRoom : maxChildrenPerRoom;
            return l;
        }

        public Integer getMaxStayNights() {
            return maxStayNights;
        }

        public void setMaxStayNights(Integer maxStayNights) {
            this.maxStayNights = maxStayNights;
        }

        public Integer getMaxAdvanceDays() {
            return maxAdvanceDays;
        }

        public void setMaxAdvanceDays(Integer maxAdvanceDays) {
            this.maxAdvanceDays = maxAdvanceDays;
        }

        public Integer getMaxRooms() {
            return maxRooms;
        }

        public void setMaxRooms(Integer maxRooms) {
            this.maxRooms = maxRooms;
        }

        public Integer getMaxAdultsPerRoom() {
            return maxAdultsPerRoom;
        }

        public void setMaxAdultsPerRoom(Integer maxAdultsPerRoom) {
            this.maxAdultsPerRoom = maxAdultsPerRoom;
        }

        public Integer getMaxChildrenPerRoom() {
            return maxChildrenPerRoom;
        }

        public void setMaxChildrenPerRoom(Integer maxChildrenPerRoom) {
            this.maxChildrenPerRoom = maxChildrenPerRoom;
        }
    }
}


# search-service/src/main/java/com/hotelbooking/search/SearchService.java
package com.hotelbooking.search;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.hotelbooking.common.events.EventNames;
import com.hotelbooking.common.events.EventPublisher;
import com.hotelbooking.common.privacy.Masking;
import com.hotelbooking.common.resilience.DependencyUnavailableException;
import com.hotelbooking.common.web.ApiException;
import com.hotelbooking.common.web.FieldIssue;
import com.hotelbooking.search.SearchApi.Criteria;
import com.hotelbooking.search.SearchApi.HotelPage;
import com.hotelbooking.search.SearchApi.SearchRequest;
import com.hotelbooking.search.SearchApi.SearchResponse;
import com.hotelbooking.search.SearchApi.Status;
import com.hotelbooking.search.SearchApi.Suggestion;

import reactor.core.publisher.Mono;

/**
 * Creates searches. The same criteria submitted again in the same session within the session TTL returns the
 * same search id, so double submits do not create inconsistent sessions (story 3.3 AC3).
 */
@Service
public class SearchService {

    record StoredSearch(String searchId, String sessionId, Criteria criteria, Instant createdAt) {
    }

    private final SearchValidator validator;
    private final SearchRules rules;
    private final HotelClient hotels;
    private final EventPublisher events;
    private final Clock clock;
    private final Map<String, StoredSearch> byId = new ConcurrentHashMap<>();
    private final Map<String, String> bySessionAndCriteria = new ConcurrentHashMap<>();

    public SearchService(SearchValidator validator, SearchRules rules, HotelClient hotels, EventPublisher events, Clock clock) {
        this.validator = validator;
        this.rules = rules;
        this.hotels = hotels;
        this.events = events;
        this.clock = clock;
    }

    public Mono<SearchResponse> search(SearchRequest request, String sessionHeader) {
        long started = System.nanoTime();
        List<FieldIssue> issues = validator.validate(request);
        if (!issues.isEmpty()) {
            return events.event(EventNames.SEARCH_VALIDATED).outcome("rejected")
                    .attr("rules", issues.stream().map(FieldIssue::ruleId).toList()).publish()
                    .then(Mono.error(new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                            "Please correct the highlighted search details.", false, issues)));
        }
        Criteria criteria = normalise(request);
        StoredSearch stored = remember(sessionHeader, criteria);
        return events.event(EventNames.SEARCH_SUBMITTED).attr("searchId", stored.searchId())
                .attr("destination", criteria.destination()).attr("nights", criteria.nights())
                .attr("rooms", criteria.rooms()).publish()
                .then(run(stored, Map.of(), started));
    }

    public Mono<SearchResponse> refine(String searchId, Map<String, String> refinements) {
        StoredSearch stored = Optional.ofNullable(byId.get(searchId)).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, "SEARCH_NOT_FOUND", "That search has expired. Please search again."));
        return run(stored, refinements, System.nanoTime());
    }

    private Mono<SearchResponse> run(StoredSearch s, Map<String, String> refinements, long started) {
        Criteria c = s.criteria();
        return hotels.availability(c, refinements)
                .flatMap(page -> {
                    boolean any = page.results().stream().anyMatch(SearchApi.HotelCard::bookable);
                    boolean filtered = page.resetAvailable();
                    Status status = any ? Status.RESULTS : Status.NO_AVAILABILITY;
                    String message = any ? null : filtered
                            ? "No hotels match the filters you applied. Remove a filter or reset all filters."
                            : "We found no available rooms matching your search. Try changing your dates, the number of rooms or guests, or the destination.";
                    SearchResponse response = new SearchResponse(s.searchId(), s.sessionId(), status, c, message, false,
                            any ? List.of() : suggestions(c, filtered), page);
                    return events.event(EventNames.RESULTS_IMPRESSION).outcome(status.name().toLowerCase(Locale.ROOT))
                            .attr("searchId", s.searchId()).attr("results", page.totalResults())
                            .duration(elapsed(started)).publish().thenReturn(response);
                })
                .onErrorResume(DependencyUnavailableException.class, e -> events.event(EventNames.SEARCH_FAILED)
                        .error(e.category().name()).attr("searchId", s.searchId()).attr("dependency", e.dependency())
                        .duration(elapsed(started)).publish()
                        .thenReturn(new SearchResponse(s.searchId(), s.sessionId(), Status.SERVICE_UNAVAILABLE, c,
                                "We couldn't load hotels right now. Your search details are saved, please try again.",
                                true, List.of(new Suggestion("RETRY", "Try again", request(c))), null)));
    }

    private StoredSearch remember(String sessionHeader, Criteria criteria) {
        String sessionId = sessionHeader == null || sessionHeader.isBlank() ? UUID.randomUUID().toString() : sessionHeader;
        String key = Masking.fingerprint(sessionId, criteria.destination(), criteria.checkIn().toString(),
                criteria.checkOut().toString(), String.valueOf(criteria.rooms()), String.valueOf(criteria.adults()),
                String.valueOf(criteria.children()));
        Instant now = clock.instant();
        synchronized (this) {
            String existing = bySessionAndCriteria.get(key);
            StoredSearch previous = existing == null ? null : byId.get(existing);
            if (previous != null && previous.createdAt().plus(rules.getSessionTtl()).isAfter(now)) {
                return previous;
            }
            StoredSearch created = new StoredSearch("S-" + UUID.randomUUID().toString().substring(0, 8), sessionId, criteria, now);
            byId.put(created.searchId(), created);
            bySessionAndCriteria.put(key, created.searchId());
            return created;
        }
    }

    public int storedSearches() {
        return byId.size();
    }

    private List<Suggestion> suggestions(Criteria c, boolean filtered) {
        List<Suggestion> out = new ArrayList<>();
        if (filtered) {
            out.add(new Suggestion("RESET_FILTERS", "Reset all filters", request(c)));
        }
        out.add(new Suggestion("CHANGE_DATES", "Try one day later",
                new SearchRequest(c.destination(), c.checkIn().plusDays(1), c.checkOut().plusDays(1), c.rooms(), c.adults(), c.children())));
        if (c.rooms() > 1 || c.adults() > 1 || c.children() > 0) {
            out.add(new Suggestion("CHANGE_OCCUPANCY", "Search for fewer guests",
                    new SearchRequest(c.destination(), c.checkIn(), c.checkOut(), 1, 1, 0)));
        }
        rules.getDestinations().stream().filter(d -> !d.equalsIgnoreCase(c.destination())).findFirst()
                .ifPresent(d -> out.add(new Suggestion("CHANGE_DESTINATION", "Try " + d,
                        new SearchRequest(d, c.checkIn(), c.checkOut(), c.rooms(), c.adults(), c.children()))));
        return out;
    }

    private static SearchRequest request(Criteria c) {
        return new SearchRequest(c.destination(), c.checkIn(), c.checkOut(), c.rooms(), c.adults(), c.children());
    }

    private static Criteria normalise(SearchRequest r) {
        int children = r.children() == null ? 0 : r.children();
        return new Criteria(r.destination().trim().toUpperCase(Locale.ROOT), r.checkIn(), r.checkOut(), r.rooms(),
                r.adults(), children, ChronoUnit.DAYS.between(r.checkIn(), r.checkOut()));
    }

    private static long elapsed(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }
}


# search-service/src/main/java/com/hotelbooking/search/SearchServiceApplication.java
package com.hotelbooking.search;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/** Epic 1 (AQPI-2): search, validation and no-availability handling. */
@SpringBootApplication
@EnableConfigurationProperties(SearchRules.class)
public class SearchServiceApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(SearchServiceApplication.class).properties("spring.config.name=search-service").run(args);
    }
}


# search-service/src/main/java/com/hotelbooking/search/SearchValidator.java
package com.hotelbooking.search;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.hotelbooking.common.web.FieldIssue;
import com.hotelbooking.search.SearchApi.FieldSpec;
import com.hotelbooking.search.SearchApi.FormSpec;
import com.hotelbooking.search.SearchApi.SearchRequest;

/** Authoritative server-side validation for search criteria (stories 3.1 AC3, 3.2). */
@Component
public class SearchValidator {

    public static final String RULES_VERSION = "search-rules-v1";
    private static final Pattern DESTINATION = Pattern.compile("[\\p{L} .'-]{2,60}");

    private final SearchRules rules;
    private final Clock clock;

    public SearchValidator(SearchRules rules, Clock clock) {
        this.rules = rules;
        this.clock = clock;
    }

    public LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneId.of(rules.getZone())));
    }

    public List<FieldIssue> validate(SearchRequest r) {
        List<FieldIssue> issues = new ArrayList<>();
        SearchRules.Limits limits = rules.limitsFor(r.destination());
        LocalDate today = today();
        if (r.destination() == null || r.destination().isBlank()) {
            issues.add(new FieldIssue("destination", "destination.required", "Enter a destination, for example New York."));
        } else if (!DESTINATION.matcher(r.destination().trim()).matches()) {
            issues.add(new FieldIssue("destination", "destination.format",
                    "Destination can only contain letters, spaces, apostrophes and hyphens (2 to 60 characters)."));
        }
        if (r.checkIn() == null) {
            issues.add(new FieldIssue("checkIn", "checkIn.required", "Enter a check-in date."));
        } else if (r.checkIn().isBefore(today)) {
            issues.add(new FieldIssue("checkIn", "checkIn.past", "Check-in date cannot be in the past. Choose today or a later date."));
        } else if (ChronoUnit.DAYS.between(today, r.checkIn()) > limits.getMaxAdvanceDays()) {
            issues.add(new FieldIssue("checkIn", "checkIn.tooFarAhead",
                    "Bookings can be made up to " + limits.getMaxAdvanceDays() + " days ahead. Choose an earlier check-in date."));
        }
        if (r.checkOut() == null) {
            issues.add(new FieldIssue("checkOut", "checkOut.required", "Enter a check-out date."));
        } else if (r.checkIn() != null && !r.checkOut().isAfter(r.checkIn())) {
            issues.add(new FieldIssue("checkOut", "checkOut.notAfterCheckIn", "Check-out date must be after the check-in date."));
        } else if (r.checkIn() != null && ChronoUnit.DAYS.between(r.checkIn(), r.checkOut()) > limits.getMaxStayNights()) {
            issues.add(new FieldIssue("checkOut", "stay.tooLong",
                    "Stays can be up to " + limits.getMaxStayNights() + " nights. Shorten your stay."));
        }
        if (r.rooms() == null) {
            issues.add(new FieldIssue("rooms", "rooms.required", "Enter the number of rooms."));
        } else if (r.rooms() < 1 || r.rooms() > limits.getMaxRooms()) {
            issues.add(new FieldIssue("rooms", "rooms.range", "Choose between 1 and " + limits.getMaxRooms() + " rooms."));
        }
        if (r.adults() == null) {
            issues.add(new FieldIssue("adults", "adults.required", "Enter the number of adults."));
        } else if (r.rooms() != null && r.rooms() >= 1) {
            if (r.adults() < r.rooms()) {
                issues.add(new FieldIssue("adults", "adults.perRoom", "Each room needs at least one adult."));
            } else if (r.adults() > r.rooms() * limits.getMaxAdultsPerRoom()) {
                issues.add(new FieldIssue("adults", "adults.max", "Up to " + limits.getMaxAdultsPerRoom()
                        + " adults per room are allowed. Add a room or reduce the number of adults."));
            }
        }
        int children = r.children() == null ? 0 : r.children();
        if (children < 0) {
            issues.add(new FieldIssue("children", "children.negative", "Number of children cannot be negative."));
        } else if (r.rooms() != null && r.rooms() >= 1 && children > r.rooms() * limits.getMaxChildrenPerRoom()) {
            issues.add(new FieldIssue("children", "children.max", "Up to " + limits.getMaxChildrenPerRoom()
                    + " children per room are allowed. Add a room or reduce the number of children."));
        }
        return issues;
    }

    public FormSpec form() {
        SearchRules.Limits d = rules.getDefaults();
        return new FormSpec(List.of(
                new FieldSpec("destination", "Destination", "text", true, "2-60 letters", "City or area, for example New York", "destination-error"),
                new FieldSpec("checkIn", "Check-in date", "date", true, "today or later, up to " + d.getMaxAdvanceDays() + " days ahead", "Format YYYY-MM-DD", "checkIn-error"),
                new FieldSpec("checkOut", "Check-out date", "date", true, "after check-in, up to " + d.getMaxStayNights() + " nights", "Format YYYY-MM-DD", "checkOut-error"),
                new FieldSpec("rooms", "Rooms", "number", true, "1-" + d.getMaxRooms(), null, "rooms-error"),
                new FieldSpec("adults", "Adults", "number", true, "at least 1 per room, up to " + d.getMaxAdultsPerRoom() + " per room", null, "adults-error"),
                new FieldSpec("children", "Children", "number", false, "0-" + d.getMaxChildrenPerRoom() + " per room", "Optional", "children-error")),
                "alert", "assertive", RULES_VERSION);
    }
}


# search-service/src/main/resources/search-service.yml
server:
  port: 8082
platform:
  service: search-service
  environment: local
  dependencies:
    hotel-service:
      base-url: http://localhost:8081
      timeout: 2s
      retries: 1
  search:
    # @rule [AQPI-34] A stay can be at most 30 nights; Paris (PAR) allows at most 14 nights.
    # @rule [AQPI-4] Each room holds at most 4 adults and 3 children, and one search books 1 to 8 rooms.
    # @rule [AQPI-4] Check-in can be at most 500 days ahead.
    defaults:
      max-stay-nights: 30
      max-advance-days: 500
      max-rooms: 8
      max-adults-per-room: 4
      max-children-per-room: 3
    markets:
      PAR:
        max-stay-nights: 14
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics


# TRACEABILITY.md
# AQPI story traceability

Maps every story in the Jira space AQPI (https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-1) to the code and tests that cover it. Test methods carry the Jira key in `@DisplayName`, so `mvn test` output can be traced back to a story.

| Jira | Story | Epic | Acceptance criteria | Code | Tests | Limitation |
|---|---|---|---|---|---|---|
| [AQPI-3](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-3) | 3.1 Search hotels by destination and date range | AQPI-2 Search and Availability | 1. Given valid search criteria, when the guest submits the search, then a search request is created and matching available hotels are returned.<br>2. The submitted criteria remain visible and editable on the results page.<br>3. Past check-in dates, check-out dates not after check-in, and missing mandatory fields are rejected with actionable messages.<br>4. A no-availability result explains that no matching inventory was found and allows criteria changes. | search-service: SearchController POST /api/searches, SearchService, SearchValidator | BookingJourneyTest#happyPathBooking<br>SearchServiceTest#searchResults | Destinations are a fixed demo catalog (NYC, LON, PAR). |
| [AQPI-4](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-4) | 3.2 Validate occupancy and stay criteria | AQPI-2 Search and Availability | 1. Required fields are clearly identified.<br>2. Invalid combinations return field-level messages.<br>3. Server validation is authoritative when client and server results differ.<br>4. Validation messages are accessible to assistive technology. | search-service: SearchValidator, SearchRules, GET /api/searches/form, POST /api/searches/validate | BookingJourneyTest#invalidSearch<br>SearchServiceTest#validationRules | Limits are configuration properties, not an admin UI. |
| [AQPI-5](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-5) | 3.3 Handle unavailable or failed searches | AQPI-2 Search and Availability | 1. Zero results provide options to alter dates, occupancy, destination, or filters.<br>2. Technical failures display a non-technical message and retry option.<br>3. Repeated submission does not create inconsistent sessions. | search-service: SearchService (NO_AVAILABILITY, SERVICE_UNAVAILABLE, suggestions), HotelClient | BookingJourneyTest#noAvailability<br>SearchServiceTest#dependencyUnavailable<br>SearchServiceTest#noAvailability |  |
| [AQPI-7](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-7) | 4.1 Display available hotels | AQPI-6 Hotel Results and Selection | 1. Each result shows hotel name, location, representative image, starting price, currency, and availability indicator.<br>2. Mandatory fees or pricing qualifications are clearly disclosed.<br>3. Unavailable hotels are not presented as immediately bookable.<br>4. Results support pagination or progressive loading. | hotel-service: HotelController GET /api/hotels/availability, HotelQueries, Catalog, Pricing | BookingJourneyTest#happyPathBooking<br>HotelServiceTest#resultsCards | Images are placeholder references. |
| [AQPI-8](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-8) | 4.2 Sort and filter hotel results | AQPI-6 Hotel Results and Selection | 1. The guest can apply supported filters such as price range, amenities, hotel category, and distance when data is available.<br>2. The guest can sort using approved options.<br>3. Selected criteria are visible and removable.<br>4. Zero results after filtering offer a reset option. | hotel-service: HotelQueries (sort, filters, pagination, reset); search-service refine | HotelServiceTest#refineResults<br>BookingJourneyTest#unsupportedSortRefused |  |
| [AQPI-9](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-9) | 4.3 View hotel and room details | AQPI-6 Hotel Results and Selection | 1. Hotel description, images, location, amenities, room options, pricing, major policies, and relevant restrictions are displayed.<br>2. The guest can select a valid room and rate plan.<br>3. If inventory changes, the guest is informed before continuing. | hotel-service: GET /api/hotels/{id}, POST /api/hotels/{id}/quotes | BookingJourneyTest#happyPathBooking<br>HotelServiceTest#hotelDetails<br>HotelServiceTest#quotePriceChange | Rates and inventory are in-memory. |
| [AQPI-11](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-11) | 5.1 Determine eligible ancillary offers | AQPI-10 Personalized Ancillary Offers | 1. The service considers available context such as stay dates, season, destination, hotel, room, party composition, declared interests, and consented profile attributes.<br>2. Unavailable or ineligible products are excluded.<br>3. The service returns a reason code for each recommended item.<br>4. When personalization data is unavailable, safe contextual defaults may be returned. | offer-service: OfferEngine.recommend, OfferCatalog | BookingJourneyTest#happyPathBooking<br>OfferServiceTest#eligibilityBeforeRanking |  |
| [AQPI-12](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-12) | 5.2 Display ancillary offers | AQPI-10 Personalized Ancillary Offers | 1. Each offer shows name, description, price, currency, applicability, and any restrictions.<br>2. The guest can add, skip, or dismiss an offer.<br>3. Offers are clearly distinguished from mandatory fees.<br>4. Failure to load offers does not block room booking. | offer-service: POST /api/offers/validate, /api/offers/interactions | BookingJourneyTest#unavailableExtraIsolated<br>OfferServiceTest#dismissal<br>OfferServiceTest#validateItems | No UI; display is the API contract. |
| [AQPI-13](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-13) | 5.3 Explain and control personalization | AQPI-10 Personalized Ancillary Offers | 1. The interface identifies when offers are personalized where required.<br>2. The guest can proceed without selecting ancillary products.<br>3. A consent or preference change affects future eligible recommendations according to policy. | offer-service: ConsentStore, /api/consents/{profileId} | OfferServiceTest#consentAwarePersonalisation | Consent store is in-memory; no identity provider. |
| [AQPI-15](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-15) | 6.1 Add room selection to cart | AQPI-14 Cart Management | 1. The cart contains hotel, room, rate plan, stay dates, occupancy, quantity, currency, and price components.<br>2. Inventory and price are revalidated when required.<br>3. The cart has a defined expiration and displays relevant timeout behavior. | cart-service: CartService.create/view, CartProperties (20 min TTL, AQPI-33) | BookingJourneyTest#happyPathBooking<br>CartServiceTest#cartTotalsAndExpiry<br>CartServiceTest#unavailableRoom |  |
| [AQPI-16](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-16) | 6.2 Add, update, and remove ancillaries | AQPI-14 Cart Management | 1. The guest can add an available ancillary.<br>2. Supported quantities can be changed within product limits.<br>3. Removal updates totals immediately.<br>4. Ineligible or sold-out products cannot be retained silently. | cart-service: CartService ancillary add/update/remove, Downstream.validateOffers | BookingJourneyTest#happyPathBooking<br>BookingJourneyTest#unavailableExtraIsolated<br>CartServiceTest#offerOutageIsolated |  |
| [AQPI-17](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-17) | 6.3 Review cart and total price | AQPI-14 Cart Management | 1. Room charges, taxes, mandatory fees, optional products, discounts, and total are itemized.<br>2. Currency is consistently displayed.<br>3. Material changes are highlighted and require acknowledgement.<br>4. The guest can return to edit supported selections. | cart-service: CartService.revalidate/acknowledge/checkout, totals | BookingJourneyTest#priceChangeNeedsAcknowledgement<br>CartServiceTest#materialChange<br>HotelServiceTest#quotePriceChange |  |
| [AQPI-19](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-19) | 7.1 Capture guest and contact information | AQPI-18 Checkout and Reservation | 1. Required and optional fields are clearly distinguished.<br>2. Inputs are validated and error messages are accessible.<br>3. The guest receives applicable privacy notice and consent controls.<br>4. Data is transmitted securely and is not exposed in client logs. | reservation-service: GuestValidator, ReservationService.submit | BookingJourneyTest#happyPathBooking<br>BookingJourneyTest#rawCardRejected<br>ReservationServiceTest#guestValidation |  |
| [AQPI-20](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-20) | 7.2 Capture and authorize payment | AQPI-18 Checkout and Reservation | 1. The guest sees the final payable or guarantee amount before authorization.<br>2. Payment data is handled through approved secure components.<br>3. Authorization success, decline, timeout, and technical failure are handled distinctly.<br>4. The product does not store prohibited card data in application logs. | reservation-service: PaymentGateway (simulated tokens), GET /api/checkout/{cartId}/payment-summary | BookingJourneyTest#happyPathBooking<br>BookingJourneyTest#paymentDeclined<br>ReservationServiceTest#payAtHotelGuarantee | Payment provider is simulated; tokens like tok_visa_ok / tok_decline drive outcomes. |
| [AQPI-21](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-21) | 7.3 Create reservation idempotently | AQPI-18 Checkout and Reservation | 1. A successful request creates one reservation and returns a confirmation identifier.<br>2. Repeated submissions with the same idempotency key do not create duplicate reservations.<br>3. Inventory, price, payment, and reservation outcomes remain reconcilable.<br>4. Partial failures trigger defined recovery or manual-review handling. | reservation-service: ReservationService (Idempotency-Key, inventory commit/void), hotel-service inventory commitments | BookingJourneyTest#happyPathBooking<br>BookingJourneyTest#idempotencyMismatch<br>BookingJourneyTest#lastRoomSoldOnce<br>BookingJourneyTest#lostPaymentResponseReconciled<br>BookingJourneyTest#priceChangeNeedsAcknowledgement<br>CartServiceTest#completedCart<br>HotelServiceTest#inventoryCommitments<br>ReservationServiceTest#inventoryConflictVoidsPayment<br>ReservationServiceTest#inventoryTimeoutRecovered | Idempotency store is in-memory, single instance. |
| [AQPI-22](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-22) | 7.4 Show booking outcome | AQPI-18 Checkout and Reservation | 1. Success displays confirmation identifier, hotel, stay summary, selected products, and total.<br>2. A failure does not display a false confirmation.<br>3. Unknown or timeout states instruct the guest not to resubmit blindly and provide a safe recovery path. | reservation-service: Outcome, GET /api/reservations/{id}, reconcile, ops manual-review | BookingJourneyTest#happyPathBooking<br>BookingJourneyTest#lostPaymentResponseReconciled<br>BookingJourneyTest#paymentDeclined<br>ReservationServiceTest#failedVoidGoesToManualReview |  |
| [AQPI-24](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-24) | 8.1 Generate confirmation message | AQPI-23 Confirmation and Notifications | 1. The message contains guest-safe confirmation details, hotel information, stay dates, booked items, pricing summary, and applicable policy information.<br>2. The message content matches the confirmed reservation state.<br>3. Templates support required locale and accessibility standards.<br>4. (release 2.0) The confirmation e-mail of a refundable booking states its free-cancellation deadline, 48 hours before check-in. | notification-service: TemplateRenderer, NotificationService.confirm; TemplateRenderer.freeCancellationDeadline, NotificationProperties.freeCancellationWindow (48h) | BookingJourneyTest#happyPathBooking<br>NotificationServiceTest#accessibleTemplate<br>ReservationServiceTest#notificationFailureKeepsBooking<br>NotificationServiceTest#freeCancellationDeadline |  |
| [AQPI-25](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-25) | 8.2 Send and track confirmation email | AQPI-23 Confirmation and Notifications | 1. A successful reservation creates one confirmation-email request.<br>2. Send failure does not reverse a valid reservation.<br>3. (release 2.0) Operations can retry a failed confirmation e-mail at most 3 times; a further retry is refused.<br>4. Operational users can distinguish queued, sent, delivered, bounced, and failed states when supported by the provider. | notification-service: EmailProvider (simulated), delivery states, webhook, ops retry; NotificationProperties.maxManualRetries, notification-service.yml | BookingJourneyTest#happyPathBooking<br>NotificationServiceTest#deliveryStates<br>NotificationServiceTest#idempotentConfirmation | E-mail provider is simulated (fail.test, flaky.test, bounce.test domains). A 4th retry is refused. |
| [AQPI-26](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-26) | 8.3 Resend confirmation safely | AQPI-23 Confirmation and Notifications | 1. The request verifies sufficient reservation information without exposing data.<br>2. Rate limits and abuse controls apply.<br>3. The resend creates a new message event without creating a new reservation. | notification-service: POST /api/confirmations/resend (generic answer, rate limits: 5 per booking in 24 hours, AQPI-35) | BookingJourneyTest#resendConfirmation<br>NotificationServiceTest#resendGeneric |  |
| [AQPI-28](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-28) | 9.1 Protect sensitive data | AQPI-27 Cross-Cutting Quality, Privacy and Observability | 1. Sensitive data is classified and mapped to approved storage and processing locations.<br>2. Data is encrypted in transit and at rest where required.<br>3. Logs and analytics exclude or mask prohibited fields.<br>4. Access to operational data is role-based and auditable.<br>5. Retention and deletion follow approved policy. | platform-common: FieldCipher, Masking, DataMap; reservation ops views and retention purge | BookingJourneyTest#rawCardRejected<br>PlatformCommonTest#fieldCipher<br>PlatformCommonTest#masking<br>ReservationServiceTest#opsViewMasking<br>ReservationServiceTest#retentionPurge | Encryption key comes from configuration; no KMS. |
| [AQPI-29](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-29) | 9.2 Provide end-to-end observability | AQPI-27 Cross-Cutting Quality, Privacy and Observability | 1. Events use a correlation ID across supported services.<br>2. Business events and technical logs are distinguishable.<br>3. Metrics and alerts exist for agreed critical failures and latency.<br>4. Logging degradation does not expose sensitive payloads or silently block booking unless explicitly required. | platform-common: CorrelationIdWebFilter, CorrelationPropagation, EventPublisher, BusinessEvent | BookingJourneyTest#happyPathBooking<br>PlatformCommonTest#correlationIdSanitised<br>PlatformCommonTest#eventsScrubbed | Events are structured logs and Micrometer counters; no tracing backend. |
| [AQPI-30](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-30) | 9.3 Meet accessibility requirements | AQPI-27 Cross-Cutting Quality, Privacy and Observability | 1. Keyboard navigation, focus order, labels, instructions, status messaging, and error handling are accessible.<br>2. Visual information is not conveyed by color alone.<br>3. Dynamic updates are announced appropriately.<br>4. Email templates are readable and structurally accessible. | search-service FormSpec (labels, error summary role/live region); notification TemplateRenderer (lang, headings, captions, text part) | NotificationServiceTest#accessibleTemplate<br>SearchServiceTest#validationRules | APIs and the e-mail template only; no browser UI to test keyboard/focus. |
| [AQPI-31](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-31) | 9.4 Meet performance and reliability objectives | AQPI-27 Cross-Cutting Quality, Privacy and Observability | 1. Search, pricing, cart, checkout, reservation, and email dependencies have agreed performance targets.<br>2. Timeout, retry, circuit-breaker, and fallback behavior are documented.<br>3. Load, resilience, and recovery tests cover critical journeys.<br>4. Reservation integrity is prioritized over non-critical personalization and analytics. | platform-common: DependencyCalls (timeouts, retries, circuit breakers), DependencyUnavailableException; per-service dependency config | BookingJourneyTest#unavailableExtraIsolated<br>CartServiceTest#offerOutageIsolated<br>PlatformCommonTest#retries<br>PlatformCommonTest#timeout<br>ReservationServiceTest#inventoryTimeoutRecovered<br>SearchServiceTest#dependencyUnavailable | Resilience is tested; load and performance targets are not measured. |
| [AQPI-33](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-33) | 10.1 Shorten the cart hold to 20 minutes | AQPI-32 Release 2.0 | 1. A new cart expires 20 minutes after it is created.<br>2. An expired cart cannot be checked out. | cart-service: CartProperties.ttl (20m), cart-service.yml | CartServiceTest#cartTotalsAndExpiry |  |
| [AQPI-34](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-34) | 10.2 Limit Paris stays to 14 nights | AQPI-32 Release 2.0 | 1. A Paris (PAR) stay of up to 14 nights is accepted.<br>2. A Paris stay of more than 14 nights is rejected with a field-level message. | search-service: SearchRules, search-service.yml (PAR maximum stay) | (no unit test) | A 15-night Paris stay is rejected. |
| [AQPI-35](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-35) | 10.3 Allow up to 5 confirmation resends | AQPI-32 Release 2.0 | 1. A guest can resend the confirmation 5 times per booking in 24 hours.<br>2. The 6th resend is refused (HTTP 429). | notification-service: NotificationProperties.resendLimit (5), notification-service.yml | BookingJourneyTest#resendConfirmation |  |
| [AQPI-36](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-36) | 10.4 Cancel a reservation free of charge | AQPI-32 Release 2.0 | 1. A refundable booking can be cancelled free of charge up to 48 hours before check-in.<br>2. A later cancellation is refused and the booking stays confirmed.<br>3. A non-refundable rate cannot be cancelled free of charge.<br>4. A cancelled booking is CANCELLED, its payment hold voided and its room released. | reservation-service: POST /api/reservations/{id}/cancel, ReservationService.cancel, ReservationProperties.freeCancellationWindow (48h) | BookingJourneyTest#freeCancellation<br>BookingJourneyTest#lateCancellationRefused<br>ReservationServiceTest#freeCancellation<br>ReservationServiceTest#lateCancellationRefused<br>ReservationServiceTest#nonRefundableNotCancelled |  |
| [AQPI-37](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-37) | 8.4 Send a cancellation e-mail | AQPI-23 Confirmation and Notifications | 1. A cancelled reservation gets one cancellation e-mail; cancelling it again does not send another.<br>2. A cancellation e-mail that cannot be sent does not undo the cancellation.<br>3. Operational users see the cancellation e-mail with its own delivery state, separate from the confirmation. | reservation-service: ReservationService.cancellationEmail, Downstream.requestCancellationEmail; notification-service: POST /api/cancellations, NotificationService.cancellation, TemplateRenderer.renderCancellation | NotificationServiceTest#cancellationEmail<br>ReservationServiceTest#cancellationEmail | E-mail provider is simulated. |

## Known defects

Found by the Agentic QE Flow 1 cycle on release 1.0. Release 2.0 fixes all of them; the Flow 2 cycle retests and closes them.

| Story | Rule | Defect | Code | Release 2.0 |
|---|---|---|---|---|
| [AQPI-4](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-4) 3.2 Validate occupancy and stay criteria | One search books 1 to 8 rooms | Release 1.0 accepts a search for 9 rooms (Flow 1) | search-service.yml `max-rooms` | Fixed: `max-rooms: 8`; retested by Flow 2 |
| [AQPI-17](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-17) 6.3 Review cart and total price | A price change of more than 1% must be acknowledged | A 0.5% change already asks for acknowledgement (Flow 1) | cart-service.yml `material-change-percent` | Fixed: `1.0`; retested by Flow 2 |
| [AQPI-21](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-21) 7.3 Create reservation idempotently | Idempotency-Key of 8 to 64 characters | A 7-character key is accepted (Flow 1) | ReservationService `KEY` pattern | Fixed: `{8,64}`; retested by Flow 2 |
| [AQPI-34](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-34) 10.2 Limit Paris stays to 14 nights | Paris allows at most 14 nights | A 15-night Paris stay would be accepted | search-service.yml PAR `max-stay-nights` | Fixed before release: `14`; verified by Flow 2 |
| [AQPI-25](https://tcs-team-ou6drgfr.atlassian.net/browse/AQPI-25) 8.2 Send and track confirmation email | Operations can retry a failed e-mail at most 3 times | A 4th retry would be accepted | notification-service.yml `max-manual-retries` | Fixed before release: `3`; verified by Flow 2 |
