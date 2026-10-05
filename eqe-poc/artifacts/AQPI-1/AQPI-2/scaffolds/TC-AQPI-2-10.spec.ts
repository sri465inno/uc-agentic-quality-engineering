// Stage-2 design scaffold for TC-AQPI-2-10 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-10  @traces AQPI-4-AC2  @epic AQPI-2  @type negative  @priority Medium
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-10 Invalid occupancy combination returns a field-level message", async () => {
  // Trace AQPI-4-AC2: "Invalid combinations return field-level messages"
  // Precondition: Guest is on the search page
  // Test data (playbook): search.invalid.childrenOverRoomLimit
  // Step 1: Enter 3 children for 1 room and submit [data: search.invalid.childrenOverRoomLimit]
  //   Expect: Only Children shows 'A room holds at most 2 children. Add a room or reduce children.' (proves AQPI-4-AC2)
});
