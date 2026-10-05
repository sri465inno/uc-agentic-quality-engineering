// Stage-2 design scaffold for TC-AQPI-2-01 (not automation). Stage 3 implements approved cases in tests/demo-booking/.
// @case TC-AQPI-2-01  @traces AQPI-3-AC1  @epic AQPI-2  @type positive  @priority High
import { test } from '@playwright/test';

test.fixme("TC-AQPI-2-01 Valid search returns matching available hotels with a search reference", async () => {
  // Trace AQPI-3-AC1: "a search request is created and matching available hotels are returned"
  // Precondition: demo-booking is running
  // Precondition: Guest is on the search page
  // Test data (playbook): search.valid.lisbon
  // Step 1: Enter destination, check-in, check-out, rooms, adults and children [data: search.valid.lisbon]
  //   Expect: All fields accept the values without error
  // Step 2: Select 'Search hotels'
  //   Expect: Results heading shows '3 hotels available in Lisbon' (proves AQPI-3-AC1)
  // Step 3: Inspect the results
  //   Expect: Three hotel cards are listed and a search reference (S-nnnn) is shown (proves AQPI-3-AC1)
});
