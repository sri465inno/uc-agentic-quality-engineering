// Stage-2 design scaffold for TC-AQPI-2-03 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-03  @traces AQPI-3-AC3  @epic AQPI-2  @type negative  @priority High
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-03 Past check-in date is rejected with an actionable message", async () => {
  // Trace AQPI-3-AC3: "Past check-in dates"
  // Precondition: Guest is on the search page
  // Test data (playbook): search.invalid.pastCheckIn
  // Step 1: Enter criteria with check-in yesterday and submit [data: search.invalid.pastCheckIn]
  //   Expect: Check-in shows 'Check-in date cannot be in the past. Choose today or a later date.' and no results are shown (proves AQPI-3-AC3)
});
