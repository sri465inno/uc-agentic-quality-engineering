// Stage-2 design scaffold for TC-AQPI-2-06 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-06  @traces AQPI-3-AC4  @epic AQPI-2  @type positive  @priority Medium
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-06 No-availability result explains the outcome and allows criteria changes", async () => {
  // Trace AQPI-3-AC4: "explains that no matching inventory was found and allows criteria changes"
  // Precondition: Guest is on the search page
  // Test data (playbook): search.zero.reykjavik, search.valid.rome
  // Step 1: Search a destination without inventory [data: search.zero.reykjavik]
  //   Expect: Heading 'No hotels found' and text 'We found no matching inventory for these criteria.' (proves AQPI-3-AC4)
  // Step 2: Change the destination in the still-visible form and search again [data: search.valid.rome]
  //   Expect: Results heading shows '2 hotels available in Rome' (proves AQPI-3-AC4)
});
