// Stage-2 design scaffold for TC-AQPI-2-11 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-11  @traces AQPI-4-AC3 AQPI-4-BR1  @epic AQPI-2  @type negative  @priority High
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-11 Server-only market rule is enforced when the client accepts the input", async () => {
  // Trace AQPI-4-AC3: "Server validation is authoritative when client and server results differ"
  // Trace AQPI-4-BR1: "configurable where market or property rules vary"
  // Precondition: Venice market max stay per config.limits (GAP-02)
  // Test data (playbook): search.invalid.marketMaxStay.venice
  // Step 1: Search Venice for 8 nights (passes client validation) [data: search.invalid.marketMaxStay.venice]
  //   Expect: Check-out shows 'Stays in Venice are limited to 7 nights. Choose an earlier check-out date.' and no results are shown (proves AQPI-4-AC3, AQPI-4-BR1)
});
