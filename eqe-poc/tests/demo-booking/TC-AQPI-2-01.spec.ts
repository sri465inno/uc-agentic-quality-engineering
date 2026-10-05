// @case TC-AQPI-2-01  @traces AQPI-3-AC1
import { test, expect } from '@playwright/test';
import { SearchPage } from '../../pages/demo-booking/SearchPage';
import { ResultsPage } from '../../pages/demo-booking/ResultsPage';
import { searchData } from '../../test-data/playbook';

test('TC-AQPI-2-01 valid search returns matching available hotels with a search reference', async ({ page }) => {
  const search = new SearchPage(page);
  const results = new ResultsPage(page);
  const data = searchData('search.valid.lisbon');

  await test.step('Enter valid criteria and search', async () => {
    await search.goto();
    await search.search(data);
  });
  await test.step('Matching available hotels are returned (AQPI-3-AC1)', async () => {
    await results.expectResults(Number(data.expect.resultCount), data.destination);
  });
  await test.step('A search request is created: search reference shown (AQPI-3-AC1, GAP-08)', async () => {
    await expect(results.searchReference).toBeVisible();
  });
});
