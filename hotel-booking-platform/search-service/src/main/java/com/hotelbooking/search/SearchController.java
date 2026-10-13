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
    private static final Set<String> REFINEMENTS = Set.of("page", "size");

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

    /** Story 4.1: page an existing search. */
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
