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
 * Eligibility then ranking (stories 5.1-5.2). Eligibility uses only stay context; ranking may use declared
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
