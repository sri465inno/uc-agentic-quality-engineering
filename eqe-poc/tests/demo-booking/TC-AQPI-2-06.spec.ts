// @case TC-AQPI-2-06  @traces AQPI-3-AC4
import { test, expect } from '@playwright/test';
import { SearchPage } from '../../pages/demo-booking/SearchPage';
import { ResultsPage } from '../../pages/demo-booking/ResultsPage';
import { searchData } from '../../test-data/playbook';

test('TC-AQPI-2-06 no-availability result explains the outcome and allows criteria changes', async ({ page }) => {
  const search = new SearchPage(page);
  const results = new ResultsPage(page);
  const zero = searchData('search.zero.reykjavik');
  const alternative = searchData('search.valid.rome');

  await test.step('Search a destination without inventory', async () => {
    await search.goto();
    await search.search(zero);
  });
  await test.step('Outcome explains no matching inventory was found (AQPI-3-AC4)', async () => {
    await expect(results.noResultsHeading).toBeVisible();
    await expect(results.noInventoryMessage).toBeVisible();
  });
  await test.step('Change the destination in the still-visible form and search again (AQPI-3-AC4)', async () => {
    await search.field('Destination').fill(alternative.destination);
    await search.submit();
    await results.expectResults(Number(alternative.expect.resultCount), alternative.destination);
  });
});
