// Stage-2 design scaffold for TC-AQPI-2-07 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-07  @traces AQPI-3-BR2  @epic AQPI-2  @type negative  @priority Medium
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-07 Occupancy above the configured room limit is rejected", async () => {
  // Trace AQPI-3-BR2: "Occupancy must comply with configured room limits"
  // Precondition: Room limits per config.limits (GAP-01)
  // Test data (playbook): search.invalid.adultsOverRoomLimit, config.limits
  // Step 1: Enter 4 adults for 1 room and submit [data: search.invalid.adultsOverRoomLimit]
  //   Expect: Adults shows 'A room holds at most 3 adults. Add a room or reduce adults.' (proves AQPI-3-BR2)
});
