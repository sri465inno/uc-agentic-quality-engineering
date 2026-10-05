// Stage-2 design scaffold for TC-AQPI-2-04 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-04  @traces AQPI-3-AC3 AQPI-3-BR1  @epic AQPI-2  @type negative  @priority High
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-04 Check-out not after check-in is rejected", async () => {
  // Trace AQPI-3-AC3: "check-out dates not after check-in"
  // Trace AQPI-3-BR1: "Check-in must precede check-out"
  // Precondition: Guest is on the search page
  // Test data (playbook): search.invalid.checkoutNotAfterCheckin
  // Step 1: Enter check-out equal to check-in and submit [data: search.invalid.checkoutNotAfterCheckin]
  //   Expect: Check-out shows 'Check-out date must be after the check-in date.' (proves AQPI-3-AC3, AQPI-3-BR1)
});
