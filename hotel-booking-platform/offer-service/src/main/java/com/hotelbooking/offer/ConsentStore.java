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

/** Consented profile interests with retention (story 5.1 BR, 9.1 AC5). */
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
