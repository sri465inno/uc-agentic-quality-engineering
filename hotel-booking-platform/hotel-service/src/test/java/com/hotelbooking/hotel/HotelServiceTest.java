package com.hotelbooking.hotel;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.reactive.server.WebTestClient;

import com.fasterxml.jackson.databind.JsonNode;

/** Epic 2 (AQPI-6) stories 4.1-4.3 and the inventory side of 7.3 (AQPI-21). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.config.name=hotel-service")
class HotelServiceTest {

    private static final LocalDate IN = LocalDate.now().plusDays(40);
    private static final LocalDate OUT = IN.plusDays(2);
    private static final String STAY = "checkIn=" + IN + "&checkOut=" + OUT;

    @Autowired
    WebTestClient web;

    @BeforeEach
    void reset() {
        web.post().uri("/api/admin/reset").exchange().expectStatus().is2xxSuccessful();
    }

    @Test
    @DisplayName("AQPI-7 4.1: results show name, price, currency and availability for the destination")
    void resultsCards() {
        JsonNode page = get("/api/hotels/availability?destination=NYC&" + STAY);
        assertThat(page.path("totalResults").asInt()).isEqualTo(4);
        page.path("results").forEach(h -> {
            assertThat(h.path("name").asText()).isNotBlank();
            assertThat(h.path("currency").asText()).isEqualTo("USD");
            assertThat(h.path("availability").asText()).isIn("AVAILABLE", "LIMITED", "SOLD_OUT");
            if (!"SOLD_OUT".equals(h.path("availability").asText())) {
                assertThat(h.path("startingNightly").path("amount").decimalValue()).isPositive();
            }
        });
    }

    @Test
    @DisplayName("AQPI-7 4.1: results are paged")
    void pagedResults() {
        JsonNode paged = get("/api/hotels/availability?destination=NYC&size=3&page=1&" + STAY);
        assertThat(paged.path("totalPages").asInt()).isEqualTo(2);
        assertThat(paged.path("results").size()).isEqualTo(1);
    }

    @Test
    @DisplayName("AQPI-9 4.3: details show policies, rooms and whether each room fits the party")
    void hotelDetails() {
        JsonNode detail = get("/api/hotels/H-NYC-001?adults=3&" + STAY);
        assertThat(detail.path("policies").path("checkInFrom").asText()).isEqualTo("15:00");
        assertThat(detail.path("mandatoryFeeDisclosure").asText()).isNotBlank();
        Map<String, Boolean> fits = new HashMap<>();
        detail.path("rooms").forEach(r -> fits.put(r.path("code").asText(), r.path("fitsParty").asBoolean()));
        assertThat(fits).containsEntry("STD-K", false).containsEntry("STE-F", true);
        web.get().uri("/api/hotels/H-NOPE?" + STAY).exchange().expectStatus().isNotFound();
    }

    @Test
    @DisplayName("AQPI-9 AQPI-17: a stale price version is flagged on the quote")
    void quotePriceChange() {
        JsonNode quote = web.post().uri("/api/hotels/H-NYC-001/quotes")
                .bodyValue(Map.of("roomCode", "STD-K", "ratePlanCode", "FLEX", "checkIn", IN, "checkOut", OUT, "rooms", 1,
                        "adults", 2, "children", 0, "expectedPriceVersion", "stale"))
                .exchange().expectStatus().isOk().expectBody(JsonNode.class).returnResult().getResponseBody();
        assertThat(quote.path("priceChanged").asBoolean()).isTrue();
        assertThat(quote.path("total").path("amount").decimalValue()).isEqualByComparingTo(
                quote.path("roomCharge").path("amount").decimalValue().add(quote.path("taxes").path("amount").decimalValue())
                        .add(quote.path("mandatoryFees").path("amount").decimalValue()));
    }

    @Test
    @DisplayName("AQPI-21 7.3: inventory commitments are idempotent per reference and never oversell")
    void inventoryCommitments() {
        web.put().uri("/api/admin/inventory").bodyValue(Map.of("hotelId", "H-NYC-002", "roomCode", "STD-K", "rooms", 1))
                .exchange().expectStatus().is2xxSuccessful();
        Map<String, Object> first = commitment("R-1");
        web.post().uri("/api/inventory/commitments").bodyValue(first).exchange().expectStatus().is2xxSuccessful();
        web.post().uri("/api/inventory/commitments").bodyValue(first).exchange().expectStatus().is2xxSuccessful();
        web.post().uri("/api/inventory/commitments").bodyValue(commitment("R-2")).exchange()
                .expectStatus().isEqualTo(HttpStatus.CONFLICT).expectBody().jsonPath("$.code")
                .isEqualTo("INVENTORY_UNAVAILABLE");
        assertThat(get("/api/inventory/commitments").size()).isEqualTo(1);
        web.delete().uri("/api/inventory/commitments/R-1").exchange().expectStatus().is2xxSuccessful();
        web.post().uri("/api/inventory/commitments").bodyValue(commitment("R-2")).exchange()
                .expectStatus().is2xxSuccessful();
    }

    private static Map<String, Object> commitment(String reference) {
        return Map.of("reference", reference, "hotelId", "H-NYC-002", "roomCode", "STD-K", "checkIn", IN, "checkOut", OUT,
                "rooms", 1);
    }

    private JsonNode get(String uri) {
        return web.get().uri(uri).exchange().expectStatus().isOk().expectBody(JsonNode.class).returnResult()
                .getResponseBody();
    }
}
