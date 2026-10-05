// Stage-2 design scaffold for TC-AQPI-2-08 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-08  @traces AQPI-3-BR3  @epic AQPI-2  @type negative  @priority Medium
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-08 Stay longer than the configured maximum is rejected", async () => {
  // Trace AQPI-3-BR3: "Maximum stay length must be configurable"
  // Precondition: Max stay per config.limits (GAP-02)
  // Test data (playbook): search.invalid.overMaxStay, config.limits
  // Step 1: Enter a 31-night stay and submit [data: search.invalid.overMaxStay]
  //   Expect: Check-out shows 'Stays in this search are limited to 30 nights. Choose an earlier check-out date.' (proves AQPI-3-BR3)
});
