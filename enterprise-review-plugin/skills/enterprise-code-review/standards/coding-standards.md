# Coding Standards

Replace the sample rules below with your enterprise coding standards. Keep one rule per bullet with a unique ID.

## Rules
- [CS-01] Public functions, classes and REST endpoints have doc comments describing inputs, outputs and errors.
- [CS-02] No hard-coded secrets, credentials, tokens or environment-specific URLs; use the approved secrets manager / config.
- [CS-03] Errors are handled explicitly; no empty catch blocks or swallowed exceptions.
- [CS-04] New or changed business logic has unit tests; bug fixes include a regression test.
- [CS-05] Logging uses the standard structured logger; no `print`/`console.log`/`System.out` in production code; no PII in logs.
- [CS-06] Names follow the language's conventional casing; no abbreviations outside the approved glossary.
- [CS-07] Functions stay under ~50 lines and cyclomatic complexity under 10 unless justified in the PR.
