# Non-Functional Requirements Checklist

Enterprise-wide NFRs applied to every PR in addition to NFRs stated in the Jira ticket. Replace the samples with your enterprise baselines.

## Rules
- [NFR-SEC-01] All external input is validated; queries are parameterized (no string-built SQL/NoSQL/shell).
- [NFR-SEC-02] New endpoints enforce authentication and authorization.
- [NFR-SEC-03] Sensitive data (PII, card data) is encrypted in transit and at rest and masked in logs.
- [NFR-PERF-01] No N+1 queries or unbounded loops over remote calls; list endpoints are paginated.
- [NFR-PERF-02] Outbound calls have timeouts; retries use backoff.
- [NFR-REL-01] Failures of downstream dependencies are handled gracefully (fallbacks, circuit breakers where applicable).
- [NFR-OBS-01] New flows emit logs, metrics and traces with correlation IDs.
- [NFR-A11Y-01] UI changes meet WCAG 2.1 AA (labels, contrast, keyboard navigation).
- [NFR-MAINT-01] Configuration is externalized; feature flags are used for risky changes.
