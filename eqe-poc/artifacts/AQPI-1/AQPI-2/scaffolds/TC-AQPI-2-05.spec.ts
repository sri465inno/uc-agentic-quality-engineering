// Stage-2 design scaffold for TC-AQPI-2-05 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-05  @traces AQPI-3-AC3  @epic AQPI-2  @type negative  @priority High
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-05 Missing mandatory destination is rejected", async () => {
  // Trace AQPI-3-AC3: "missing mandatory fields are rejected with actionable messages"
  // Precondition: Guest is on the search page
  // Test data (playbook): search.invalid.missingDestination
  // Step 1: Leave destination empty and submit [data: search.invalid.missingDestination]
  //   Expect: Destination shows 'Enter a destination.' and focus moves to it (proves AQPI-3-AC3)
});
