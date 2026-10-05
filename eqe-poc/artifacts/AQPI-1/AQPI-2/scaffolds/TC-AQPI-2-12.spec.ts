// Stage-2 design scaffold for TC-AQPI-2-12 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-12  @traces AQPI-4-AC4  @epic AQPI-2  @type negative  @priority Medium
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-12 Validation messages are exposed to assistive technology", async () => {
  // Trace AQPI-4-AC4: "Validation messages are accessible to assistive technology"
  // Precondition: Guest is on the search page
  // Test data (playbook): search.invalid.missingDestination
  // Step 1: Submit with destination empty [data: search.invalid.missingDestination]
  //   Expect: An alert summary lists the error; Destination is marked invalid and described by its message (proves AQPI-4-AC4)
});
