// Stage-2 design scaffold for TC-AQPI-2-09 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-09  @traces AQPI-4-AC1  @epic AQPI-2  @type positive  @priority Low
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-09 Required fields are clearly identified", async () => {
  // Trace AQPI-4-AC1: "Required fields are clearly identified"
  // Precondition: Guest is on the search page
  // Test data (playbook): none
  // Step 1: Open the search page
  //   Expect: Hint 'Fields marked * are required.' is shown; Destination, Check-in, Check-out, Rooms and Adults are marked * and required (proves AQPI-4-AC1)
});
