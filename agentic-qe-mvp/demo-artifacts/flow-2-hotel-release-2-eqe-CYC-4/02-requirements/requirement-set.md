# Requirement set: Hotel booking release 2.0 (AQPI-32 + AQPI-23) · EQE (CYC-4)

138 requirements, each with its business rule, exact values and where it is stated. Reviewed by Priya Shah.

## AQPI-1

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-001 | A guest can complete the complete search-to-confirmation flow using valid inputs. | BR-001 booking-journey |  | automatable | Jira only | AQPI-1 | carried over |
| REQ-002 | Only bookable inventory and valid rates are presented as available. | BR-002 bookable-inventory |  | automatable | Jira only | AQPI-1 | carried over |
| REQ-003 | Total price is disclosed before confirmation, including mandatory taxes and fees. | BR-003 price-disclosed |  | automatable | Jira only | AQPI-1 | carried over |
| REQ-004 | Ancillary offers do not block booking when declined or unavailable. | BR-004 offers-not-blocking |  | automatable | Jira only | AQPI-1 | carried over |
| REQ-005 | The platform prevents or safely handles duplicate reservation submissions. | BR-005 duplicate-submission |  | automatable | Jira only | AQPI-1 | carried over |
| REQ-006 | A successful reservation produces a durable confirmation identifier. | BR-006 durable-confirmation |  | automatable | Jira only | AQPI-1 | carried over |
| REQ-007 | Confirmation is displayed on screen and an email request is generated. | BR-007 confirmation-shown |  | automatable | Jira only | AQPI-1 | carried over |
| REQ-008 | Required business and technical events are logged using approved identifiers and masking rules. | BR-008 unclassified | - | manual | Jira only | AQPI-1 | carried over |

## AQPI-2

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-009 | All child user stories meet their acceptance criteria and the Definition of Done. | BR-009 unclassified | - | manual | Jira only | AQPI-2; AQPI-6; AQPI-10; AQPI-14; AQPI-18; AQPI-23; AQPI-27 | unchanged |
| REQ-010 | Negative and error paths for each story are tested and evidenced. | BR-010 unclassified | - | manual | Jira only | AQPI-2; AQPI-6; AQPI-10; AQPI-14; AQPI-18; AQPI-23; AQPI-27 | unchanged |
| REQ-011 | Required logging is in place and verified free of sensitive data. | BR-011 unclassified | - | manual | Jira only | AQPI-2; AQPI-6; AQPI-10; AQPI-14; AQPI-18; AQPI-23; AQPI-27 | unchanged |
| REQ-012 | The Product Owner has accepted the capability end to end. | BR-012 unclassified | - | manual | Jira only | AQPI-2; AQPI-6; AQPI-10; AQPI-14; AQPI-18; AQPI-23; AQPI-27 | unchanged |

## AQPI-3

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-013 | Given valid search criteria, when the guest submits the search, then a search request is created and matching available hotels are returned. | BR-013 hotel-search |  | automatable | Jira only | AQPI-3 | carried over |
| REQ-014 | The submitted criteria remain visible and editable on the results page. | BR-014 search-criteria-kept |  | automatable | Jira only | AQPI-3 | carried over |
| REQ-015 | Past check-in dates, check-out dates not after check-in, and missing mandatory fields are rejected with actionable messages. | BR-015 search-date-validation |  | automatable | Jira only | AQPI-3 | carried over |
| REQ-016 | A no-availability result explains that no matching inventory was found and allows criteria changes. | BR-016 no-availability |  | automatable | Jira only | AQPI-3 | carried over |
| REQ-017 | Check-in must precede check-out. | BR-017 unclassified | - | manual | Jira only | AQPI-3 | carried over |
| REQ-018 | Occupancy must comply with configured room limits. | BR-018 unclassified | - | manual | Jira only | AQPI-3 | carried over |
| REQ-019 | Maximum stay length must be configurable. | BR-019 unclassified | - | manual | Jira only | AQPI-3 | carried over |

## AQPI-4

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-020 | Required fields are clearly identified. | BR-020 search-form |  | automatable | Jira only | AQPI-4 | carried over |
| REQ-021 | Invalid combinations return field-level messages. | BR-021 field-level-messages |  | automatable | Jira only | AQPI-4 | carried over |
| REQ-022 | Server validation is authoritative when client and server results differ. | BR-022 unclassified | - | manual | Jira only | AQPI-4 | carried over |
| REQ-023 | Validation messages are accessible to assistive technology. | BR-023 unclassified | - | manual | Jira only | AQPI-4 | carried over |
| REQ-024 | Validation rules must be configurable where market or property rules vary. | BR-024 unclassified | - | manual | Jira only | AQPI-4 | carried over |
| REQ-117 | Each room holds at most 4 adults and 3 children, and one search books 1 to 8 rooms. | BR-117 occupancy-limits | adults = 4, children = 3, rooms = 8 | automatable | Code only | search-service/src/main/resources/search-service.yml:13 | unchanged |
| REQ-118 | Check-in can be at most 500 days ahead. | BR-118 advance-horizon | days = 500 | automatable | Code only | search-service/src/main/resources/search-service.yml:14 | unchanged |

## AQPI-5

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-025 | Zero results provide options to alter dates, occupancy, destination, or filters. | BR-025 no-availability |  | automatable | Jira only | AQPI-5 | carried over |
| REQ-026 | Technical failures display a non-technical message and retry option. | BR-026 unclassified | - | manual | Jira only | AQPI-5 | carried over |
| REQ-027 | Repeated submission does not create inconsistent sessions. | BR-027 search-session |  | automatable | Jira only | AQPI-5 | carried over |

## AQPI-7

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-028 | Each result shows hotel name, location, representative image, starting price, currency, and availability indicator. | BR-028 result-content |  | automatable | Jira only | AQPI-7 | carried over |
| REQ-029 | Mandatory fees or pricing qualifications are clearly disclosed. | BR-029 fee-disclosure |  | automatable | Jira only | AQPI-7 | carried over |
| REQ-030 | Unavailable hotels are not presented as immediately bookable. | BR-030 unavailable-not-bookable |  | automatable | Jira only | AQPI-7 | carried over |
| REQ-031 | Results support pagination or progressive loading. | BR-031 pagination |  | automatable | Jira only | AQPI-7 | carried over |
| REQ-032 | Displayed starting price must correspond to a valid rate returned for the search criteria. | BR-032 starting-price |  | automatable | Jira only | AQPI-7 | carried over |

## AQPI-8

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-129 | The guest can apply supported filters such as price range, amenities, hotel category, and distance when data is available. | BR-129 result-filters |  | automatable | Jira only | AQPI-8 | new |
| REQ-130 | The guest can sort using approved options. | BR-130 result-sorting |  | automatable | Jira only | AQPI-8 | new |
| REQ-131 | Selected criteria are visible and removable. | BR-131 unclassified | - | manual | Jira only | AQPI-8 | new |
| REQ-132 | Zero results after filtering offer a reset option. | BR-132 filter-reset |  | automatable | Jira only | AQPI-8 | new |

## AQPI-9

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-033 | Hotel description, images, location, amenities, room options, pricing, major policies, and relevant restrictions are displayed. | BR-033 hotel-details |  | automatable | Jira only | AQPI-9 | carried over |
| REQ-034 | The guest can select a valid room and rate plan. | BR-034 unclassified | - | manual | Jira only | AQPI-9 | carried over |
| REQ-035 | If inventory changes, the guest is informed before continuing. | BR-035 unclassified | - | manual | Jira only | AQPI-9 | carried over |
| REQ-036 | Rate conditions and cancellation terms must be shown before selection. | BR-036 rate-conditions |  | automatable | Jira only | AQPI-9 | carried over |

## AQPI-11

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-037 | The service considers available context such as stay dates, season, destination, hotel, room, party composition, declared interests, and consented profile attributes. | BR-037 unclassified | - | manual | Jira only | AQPI-11 | carried over |
| REQ-038 | Unavailable or ineligible products are excluded. | BR-038 offer-exclusion |  | automatable | Jira only | AQPI-11 | carried over |
| REQ-039 | The service returns a reason code for each recommended item. | BR-039 offer-reason-codes |  | automatable | Jira only | AQPI-11 | carried over |
| REQ-040 | When personalization data is unavailable, safe contextual defaults may be returned. | BR-040 unclassified | - | manual | Jira only | AQPI-11 | carried over |
| REQ-041 | Sensitive traits must not be inferred or used. | BR-041 unclassified | - | manual | Jira only | AQPI-11 | carried over |
| REQ-042 | Personalization must honor consent and data-retention rules. | BR-042 unclassified | - | manual | Jira only | AQPI-11 | carried over |
| REQ-043 | Business rules and model versions must be auditable. | BR-043 unclassified | - | manual | Jira only | AQPI-11 | carried over |

## AQPI-12

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-044 | Each offer shows name, description, price, currency, applicability, and any restrictions. | BR-044 offer-content |  | automatable | Jira only | AQPI-12 | carried over |
| REQ-045 | The guest can add, skip, or dismiss an offer. | BR-045 offer-interaction |  | automatable | Jira only | AQPI-12 | carried over |
| REQ-046 | Offers are clearly distinguished from mandatory fees. | BR-046 offer-content |  | automatable | Jira only | AQPI-12 | carried over |
| REQ-047 | Failure to load offers does not block room booking. | BR-047 offers-not-blocking |  | automatable | Jira only | AQPI-12 | carried over |

## AQPI-13

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-133 | The interface identifies when offers are personalized where required. | BR-133 unclassified | - | manual | Jira only | AQPI-13 | new |
| REQ-134 | The guest can proceed without selecting ancillary products. | BR-134 proceed-without-offers |  | automatable | Jira only | AQPI-13 | new |
| REQ-135 | A consent or preference change affects future eligible recommendations according to policy. | BR-135 consent-personalization |  | automatable | Jira only | AQPI-13 | new |

## AQPI-15

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-048 | The cart contains hotel, room, rate plan, stay dates, occupancy, quantity, currency, and price components. | BR-048 cart-contents |  | automatable | Jira only | AQPI-15 | carried over |
| REQ-049 | Inventory and price are revalidated when required. | BR-049 unclassified | - | manual | Jira only | AQPI-15 | carried over |
| REQ-050 | The cart has a defined expiration and displays relevant timeout behavior. | BR-050 unclassified | - | manual | Jira only | AQPI-15 | carried over |
| REQ-051 | A cart must not itself create a reservation. | BR-051 unclassified | - | manual | Jira only | AQPI-15 | carried over |
| REQ-052 | Price-change handling must require guest acknowledgement when material. | BR-052 unclassified | - | manual | Jira only | AQPI-15 | carried over |

## AQPI-16

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-053 | The guest can add an available ancillary. | BR-053 unclassified | - | manual | Jira only | AQPI-16 | carried over |
| REQ-054 | Supported quantities can be changed within product limits. | BR-054 ancillary-quantity |  | automatable | Jira only | AQPI-16 | carried over |
| REQ-055 | Removal updates totals immediately. | BR-055 ancillary-removal |  | automatable | Jira only | AQPI-16 | carried over |
| REQ-056 | Ineligible or sold-out products cannot be retained silently. | BR-056 unclassified | - | manual | Jira only | AQPI-16 | carried over |

## AQPI-17

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-057 | Room charges, taxes, mandatory fees, optional products, discounts, and total are itemized. | BR-057 itemized-total |  | automatable | Jira only | AQPI-17 | carried over |
| REQ-058 | Currency is consistently displayed. | BR-058 unclassified | - | manual | Jira only | AQPI-17 | carried over |
| REQ-059 | Material changes are highlighted and require acknowledgement. | BR-059 unclassified | - | manual | Jira only | AQPI-17 | carried over |
| REQ-060 | The guest can return to edit supported selections. | BR-060 unclassified | - | manual | Jira only | AQPI-17 | carried over |
| REQ-061 | The final payable total must be revalidated before reservation submission. | BR-061 unclassified | - | manual | Jira only | AQPI-17 | carried over |
| REQ-113 | A price change of more than 1% must be acknowledged by the guest before checkout. | BR-113 price-change-ack | pct = 1 | automatable | Code only | cart-service/src/main/resources/cart-service.yml:17 | unchanged |

## AQPI-19

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-062 | Required and optional fields are clearly distinguished. | BR-062 checkout-fields |  | automatable | Jira only | AQPI-19 | carried over |
| REQ-063 | Inputs are validated and error messages are accessible. | BR-063 guest-validation |  | automatable | Jira only | AQPI-19 | carried over |
| REQ-064 | The guest receives applicable privacy notice and consent controls. | BR-064 privacy-consent |  | automatable | Jira only | AQPI-19 | carried over |
| REQ-065 | Data is transmitted securely and is not exposed in client logs. | BR-065 unclassified | - | manual | Jira only | AQPI-19 | carried over |
| REQ-066 | Data minimization applies. | BR-066 unclassified | - | manual | Jira only | AQPI-19 | carried over |
| REQ-067 | Sensitive values must be masked in support tools and excluded from analytics logs. | BR-067 support-masking |  | automatable | Jira only | AQPI-19 | carried over |

## AQPI-20

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-068 | The guest sees the final payable or guarantee amount before authorization. | BR-068 amount-before-auth |  | automatable | Jira only | AQPI-20 | carried over |
| REQ-069 | Payment data is handled through approved secure components. | BR-069 unclassified | - | manual | Jira only | AQPI-20 | carried over |
| REQ-070 | Authorization success, decline, timeout, and technical failure are handled distinctly. | BR-070 payment-outcomes |  | automatable | Jira only | AQPI-20 | carried over |
| REQ-071 | The product does not store prohibited card data in application logs. | BR-071 no-card-data |  | automatable | Jira only | AQPI-20 | carried over |
| REQ-072 | Payment requirements depend on rate conditions. | BR-072 unclassified | - | manual | Jira only | AQPI-20 | carried over |
| REQ-073 | Retry behavior must avoid duplicate authorization. | BR-073 unclassified | - | manual | Jira only | AQPI-20 | carried over |

## AQPI-21

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-074 | A successful request creates one reservation and returns a confirmation identifier. | BR-074 one-reservation |  | automatable | Jira only | AQPI-21 | carried over |
| REQ-075 | Repeated submissions with the same idempotency key do not create duplicate reservations. | BR-075 idempotent-reservation |  | automatable | Jira only | AQPI-21 | carried over |
| REQ-076 | Inventory, price, payment, and reservation outcomes remain reconcilable. | BR-076 reconcilable |  | automatable | Jira only | AQPI-21 | carried over |
| REQ-077 | Partial failures trigger defined recovery or manual-review handling. | BR-077 unclassified | - | manual | Jira only | AQPI-21 | carried over |
| REQ-078 | Reservation submission must use an idempotency mechanism. | BR-078 unclassified | - | manual | Jira only | AQPI-21 | carried over |
| REQ-079 | The source of truth for confirmation status must be defined. | BR-079 unclassified | - | manual | Jira only | AQPI-21 | carried over |
| REQ-115 | Every reservation request needs an Idempotency-Key of 8 to 64 characters; a replay within 24 hours returns the original outcome. | BR-115 idempotency-key | min = 8, max = 64, hours = 24 | automatable | Code only | reservation-service/src/main/resources/reservation-service.yml:20 | unchanged |

## AQPI-22

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-136 | Success displays confirmation identifier, hotel, stay summary, selected products, and total. | BR-136 booking-outcome |  | automatable | Jira only | AQPI-22 | new |
| REQ-137 | A failure does not display a false confirmation. | BR-137 no-false-confirmation |  | automatable | Jira only | AQPI-22 | new |
| REQ-138 | Unknown or timeout states instruct the guest not to resubmit blindly and provide a safe recovery path. | BR-138 unknown-state |  | automatable | Jira only | AQPI-22 | new |

## AQPI-24

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-080 | The message contains guest-safe confirmation details, hotel information, stay dates, booked items, pricing summary, and applicable policy information. | BR-080 confirmation-content |  | automatable | Jira only | AQPI-24 | unchanged |
| REQ-081 | The message content matches the confirmed reservation state. | BR-081 confirmation-content |  | automatable | Jira only | AQPI-24 | unchanged |
| REQ-082 | Templates support required locale and accessibility standards. | BR-082 unclassified | - | manual | Jira only | AQPI-24 | unchanged |
| REQ-083 | Only necessary personal data may be included. | BR-083 unclassified | - | manual | Jira only | AQPI-24 | unchanged |
| REQ-084 | Sensitive payment details must not appear. | BR-084 confirmation-content |  | automatable | Jira only | AQPI-24 | unchanged |
| REQ-124 | The confirmation e-mail of a refundable booking states its free-cancellation deadline, 48 hours before check-in. | BR-124 cancellation-deadline-email | hours = 48 | automatable | Jira + code | AQPI-24; notification-service/src/main/resources/notification-service.yml:16 | new |

## AQPI-25

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-085 | A successful reservation creates one confirmation-email request. | BR-085 unclassified | - | manual | Jira only | AQPI-25 | unchanged |
| REQ-086 | Send failure does not reverse a valid reservation. | BR-086 email-failure-isolated |  | automatable | Jira only | AQPI-25 | unchanged |
| REQ-087 | Permitted retries avoid duplicate or excessive messages. | BR-087 unclassified | - | manual | Jira only | AQPI-25 | carried over |
| REQ-088 | Operational users can distinguish queued, sent, delivered, bounced, and failed states when supported by the provider. | BR-088 unclassified | - | manual | Jira only | AQPI-25 | unchanged |
| REQ-089 | Email addresses must be masked outside authorized operational views. | BR-089 unclassified | - | manual | Jira only | AQPI-25 | unchanged |
| REQ-125 | Operations can retry a failed confirmation e-mail at most 3 times; a further retry is refused. | BR-125 ops-retry-limit | limit = 3 | automatable | Jira + code | AQPI-25; notification-service/src/main/resources/notification-service.yml:14 | new |

## AQPI-26

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-090 | The request verifies sufficient reservation information without exposing data. | BR-090 resend-generic |  | automatable | Jira only | AQPI-26 | unchanged |
| REQ-091 | Rate limits and abuse controls apply. | BR-091 unclassified | - | manual | Jira only | AQPI-26 | unchanged |
| REQ-092 | The resend creates a new message event without creating a new reservation. | BR-092 unclassified | - | manual | Jira only | AQPI-26 | unchanged |

## AQPI-28

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-093 | Sensitive data is classified and mapped to approved storage and processing locations. | BR-093 unclassified | - | manual | Jira only | AQPI-28 | carried over |
| REQ-094 | Data is encrypted in transit and at rest where required. | BR-094 unclassified | - | manual | Jira only | AQPI-28 | carried over |
| REQ-095 | Logs and analytics exclude or mask prohibited fields. | BR-095 unclassified | - | manual | Jira only | AQPI-28 | carried over |
| REQ-096 | Access to operational data is role-based and auditable. | BR-096 support-masking |  | automatable | Jira only | AQPI-28 | carried over |
| REQ-097 | Retention and deletion follow approved policy. | BR-097 unclassified | - | manual | Jira only | AQPI-28 | carried over |

## AQPI-29

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-098 | Events use a correlation ID across supported services. | BR-098 correlation-id |  | automatable | Jira only | AQPI-29 | carried over |
| REQ-099 | Business events and technical logs are distinguishable. | BR-099 unclassified | - | manual | Jira only | AQPI-29 | carried over |
| REQ-100 | Metrics and alerts exist for agreed critical failures and latency. | BR-100 unclassified | - | manual | Jira only | AQPI-29 | carried over |
| REQ-101 | Logging degradation does not expose sensitive payloads or silently block booking unless explicitly required. | BR-101 unclassified | - | manual | Jira only | AQPI-29 | carried over |
| REQ-102 | Event schemas must be versioned. | BR-102 unclassified | - | manual | Jira only | AQPI-29 | carried over |
| REQ-103 | Production log access must be controlled and retained according to policy. | BR-103 unclassified | - | manual | Jira only | AQPI-29 | carried over |

## AQPI-30

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-104 | Keyboard navigation, focus order, labels, instructions, status messaging, and error handling are accessible. | BR-104 unclassified | - | manual | Jira only | AQPI-30 | carried over |
| REQ-105 | Visual information is not conveyed by color alone. | BR-105 unclassified | - | manual | Jira only | AQPI-30 | carried over |
| REQ-106 | Dynamic updates are announced appropriately. | BR-106 unclassified | - | manual | Jira only | AQPI-30 | carried over |
| REQ-107 | Email templates are readable and structurally accessible. | BR-107 email-accessible |  | automatable | Jira only | AQPI-30 | carried over |

## AQPI-31

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-108 | Search, pricing, cart, checkout, reservation, and email dependencies have agreed performance targets. | BR-108 unclassified | - | manual | Jira only | AQPI-31 | carried over |
| REQ-109 | Timeout, retry, circuit-breaker, and fallback behavior are documented. | BR-109 unclassified | - | manual | Jira only | AQPI-31 | carried over |
| REQ-110 | Load, resilience, and recovery tests cover critical journeys. | BR-110 unclassified | - | manual | Jira only | AQPI-31 | carried over |
| REQ-111 | Reservation integrity is prioritized over non-critical personalization and analytics. | BR-111 unclassified | - | manual | Jira only | AQPI-31 | carried over |

## AQPI-32

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-119 | Release 1.0 behaviour not named in this epic is unchanged and passes regression. | BR-119 unclassified | - | manual | Jira only | AQPI-32 | new |
| REQ-120 | The Product Owner has accepted the release 2.0 changes end to end. | BR-120 unclassified | - | manual | Jira only | AQPI-32 | new |

## AQPI-33

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-112 | A cart expires 20 minutes after it is created and never creates a reservation itself. | BR-112 cart-expiry | minutes = 20 | automatable | Jira + code | AQPI-33; cart-service/src/main/resources/cart-service.yml:16 | enhanced |

## AQPI-34

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-116 | A stay can be at most 30 nights; Paris (PAR) allows at most 14 nights. | BR-116 stay-length-limit | max = 30, par = 14 | automatable | Jira + code | AQPI-34; search-service/src/main/resources/search-service.yml:12 | enhanced |

## AQPI-35

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-114 | A confirmation can be resent at most 5 times per booking in 24 hours. | BR-114 resend-limit | limit = 5, hours = 24 | automatable | Jira + code | AQPI-35; notification-service/src/main/resources/notification-service.yml:7 | enhanced |

## AQPI-36

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-121 | A confirmed reservation on a refundable rate can be cancelled free of charge up to 48 hours before check-in; a later cancellation is refused and the reservation stays confirmed. | BR-121 free-cancellation | hours = 48 | automatable | Jira + code | AQPI-36; reservation-service/src/main/resources/reservation-service.yml:22 | new |
| REQ-122 | A cancelled reservation shows status CANCELLED, its payment authorisation is voided and its rooms are released. | BR-122 cancellation-outcome |  | automatable | Jira + code | AQPI-36; reservation-service/src/main/resources/reservation-service.yml:23 | new |
| REQ-123 | A reservation on a non-refundable rate cannot be cancelled free of charge and stays confirmed. | BR-123 non-refundable-cancellation |  | automatable | Jira only | AQPI-36 | new |

## AQPI-37

| ID | Requirement | Business rule | Exact values | Test approach | Source | Where stated | Status |
|---|---|---|---|---|---|---|---|
| REQ-126 | A cancelled reservation gets one cancellation e-mail; cancelling it again does not send another. | BR-126 cancellation-email |  | automatable | Jira + code | AQPI-37; notification-service/src/main/resources/notification-service.yml:18 | new |
| REQ-127 | A cancellation e-mail that cannot be sent does not undo the cancellation. | BR-127 cancellation-email-failure |  | automatable | Jira + code | AQPI-37; notification-service/src/main/resources/notification-service.yml:19 | new |
| REQ-128 | Operational users see the cancellation e-mail with its own delivery state, separate from the confirmation. | BR-128 unclassified | - | manual | Jira only | AQPI-37 | new |
