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
