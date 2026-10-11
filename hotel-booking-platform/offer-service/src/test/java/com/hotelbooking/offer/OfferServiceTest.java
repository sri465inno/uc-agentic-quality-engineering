package com.hotelbooking.offer;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.reactive.server.WebTestClient;

import com.fasterxml.jackson.databind.JsonNode;

/** Epic 3 (AQPI-10) stories 5.1-5.2. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.config.name=offer-service")
class OfferServiceTest {

    private static final LocalDate IN = LocalDate.now().plusDays(25);

    @Autowired
    WebTestClient web;

    @BeforeEach
    void reset() {
        web.post().uri("/api/admin/reset").exchange().expectStatus().is2xxSuccessful();
    }

    @Test
    @DisplayName("AQPI-11 5.1: eligibility is applied before ranking and every offer is labelled optional")
    void eligibilityBeforeRanking() {
        JsonNode adultsOnly = recommend(context("FLEX", 0, null, null));
        assertThat(exclusion(adultsOnly, "KIDS_CLUB")).isEqualTo("PARTY_HAS_NO_CHILDREN");
        assertThat(exclusion(adultsOnly, "SPA_ACCESS")).isEqualTo("HOTEL_LACKS_SPA");
        assertThat(adultsOnly.path("offers").size()).isBetween(1, 5);
        adultsOnly.path("offers").forEach(o -> {
            assertThat(o.path("kind").asText()).isEqualTo("OPTIONAL_EXTRA");
            assertThat(o.path("reasonCodes").size()).isPositive();
        });

        JsonNode family = recommend(context("FLEX", 1, null, null));
        assertThat(exclusion(family, "KIDS_CLUB")).isNotEqualTo("PARTY_HAS_NO_CHILDREN");

        JsonNode breakfastRate = recommend(context("BB", 0, null, null));
        assertThat(exclusion(breakfastRate, "BREAKFAST")).isEqualTo("ALREADY_INCLUDED_IN_RATE");
    }

    @Test
    @DisplayName("AQPI-11 5.1: no personalisation without stored consent, outages fall back safely")
    void personalisationNeedsConsent() {
        JsonNode none = recommend(context("FLEX", 0, "P-1", null));
        assertThat(none.path("personalized").asBoolean()).isFalse();
        assertThat(none.path("fallbackReason").asText()).isEqualTo("NO_PERSONALIZATION_CONSENT");

        web.put().uri("/api/admin/profile-store").bodyValue(Map.of("available", false)).exchange()
                .expectStatus().is2xxSuccessful();
        JsonNode fallback = recommend(context("FLEX", 0, "P-1", null));
        assertThat(fallback.path("personalized").asBoolean()).isFalse();
        assertThat(fallback.path("fallbackReason").asText()).isEqualTo("PROFILE_DATA_UNAVAILABLE");
        assertThat(fallback.path("offers").size()).isPositive();
        web.put().uri("/api/admin/profile-store").bodyValue(Map.of("available", true)).exchange()
                .expectStatus().is2xxSuccessful();
    }

    @Test
    @DisplayName("AQPI-12 5.2: a dismissed offer is not shown again in the same session")
    void dismissal() {
        web.post().uri("/api/offers/interactions")
                .bodyValue(Map.of("sessionId", "S-1", "offerCode", "LATE_CHECKOUT", "action", "DISMISS")).exchange()
                .expectStatus().is2xxSuccessful();
        assertThat(exclusion(recommend(context("FLEX", 0, null, "S-1")), "LATE_CHECKOUT"))
                .isEqualTo("DISMISSED_BY_GUEST");
    }

    @Test
    @DisplayName("AQPI-12 5.2: validation reports price, eligibility and quantity limits for cart items")
    void validateItems() {
        JsonNode result = web.post().uri("/api/offers/validate")
                .bodyValue(Map.of("context", context("FLEX", 0, null, null), "items",
                        List.of(Map.of("code", "BREAKFAST", "quantity", 1), Map.of("code", "NOPE", "quantity", 1))))
                .exchange().expectStatus().isOk().expectBody(JsonNode.class).returnResult().getResponseBody();
        JsonNode breakfast = result.path("items").get(0);
        assertThat(breakfast.path("eligible").asBoolean()).isTrue();
        assertThat(breakfast.path("linePrice").path("amount").decimalValue()).isPositive();
        assertThat(result.path("items").get(1).path("reason").asText()).isEqualTo("UNKNOWN_PRODUCT");
    }

    private JsonNode recommend(Map<String, Object> context) {
        return web.post().uri("/api/offers/recommendations").bodyValue(context).exchange().expectStatus().isOk()
                .expectBody(JsonNode.class).returnResult().getResponseBody();
    }

    private static String exclusion(JsonNode response, String code) {
        for (JsonNode e : response.path("excluded")) {
            if (code.equals(e.path("code").asText())) {
                return e.path("reason").asText();
            }
        }
        return "";
    }

    private static Map<String, Object> context(String rate, int children, String profileId, String sessionId) {
        Map<String, Object> ctx = new HashMap<>(Map.of("hotelId", "H-NYC-001", "destination", "NYC", "checkIn", IN,
                "checkOut", IN.plusDays(3), "roomCode", "STD-K", "ratePlanCode", rate, "adults", 2, "children", children,
                "currency", "USD", "hotelAmenities", List.of("wifi", "gym", "restaurant", "parking")));
        if (profileId != null) {
            ctx.put("profileId", profileId);
        }
        if (sessionId != null) {
            ctx.put("sessionId", sessionId);
        }
        return ctx;
    }
}
