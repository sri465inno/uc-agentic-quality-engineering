# Approved Libraries

Every new or upgraded dependency in the diff must appear in the approved list with an allowed version range. Replace the samples with your enterprise list.

## Approved
| Ecosystem | Library | Allowed versions | Notes |
|-----------|---------|------------------|-------|
| Java | org.springframework.boot:spring-boot-starter-* | 3.x | |
| Java | com.fasterxml.jackson.core:jackson-databind | >=2.15 | |
| Node | express | 4.x | |
| Node | axios | >=1.6 | |
| Python | requests | >=2.31 | |
| Python | pydantic | 2.x | |

## Banned
| Library | Reason | Use instead |
|---------|--------|-------------|
| log4j 1.x | EOL, vulnerable | log4j2 / logback |
| moment | Deprecated | date-fns / java.time |
| request (npm) | Deprecated | axios / fetch |

## Rules
- [LIB-01] Every added dependency is in the Approved table and within the allowed version range.
- [LIB-02] No dependency from the Banned table is added or retained in changed manifests.
- [LIB-03] Versions are pinned (no `latest`, `*`, or unbounded ranges) and lockfiles are updated with the manifest.
