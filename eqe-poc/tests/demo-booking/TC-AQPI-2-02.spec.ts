// @case TC-AQPI-2-02  @traces AQPI-3-AC2
import { test } from '@playwright/test';
import { SearchPage } from '../../pages/demo-booking/SearchPage';
import { ResultsPage } from '../../pages/demo-booking/ResultsPage';
import { playbook, searchData } from '../../test-data/playbook';

test('TC-AQPI-2-02 submitted criteria remain visible and editable on the results page', async ({ page }) => {
  const search = new SearchPage(page);
  const results = new ResultsPage(page);
  const data = searchData('search.valid.lisbon');
  const filter = playbook('filter.maxPrice.100') as { maxPrice: string; expect: { lisbonResultCount: number } };

  await test.step('Run a valid search', async () => {
    await search.goto();
    await search.search(data);
    await results.expectResults(Number(data.expect.resultCount), data.destination);
  });
  await test.step('Criteria are visible and editable on the results page (AQPI-3-AC2)', async () => {
    await search.expectCriteria(data);
  });
  await test.step('Change only the price filter and search again (AQPI-3-AC2)', async () => {
    await search.filterByMaxPrice(filter.maxPrice);
    await search.submit();
    await results.expectResults(filter.expect.lisbonResultCount, data.destination);
  });
});
