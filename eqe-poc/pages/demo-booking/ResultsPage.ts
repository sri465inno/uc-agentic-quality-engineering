// Page Object: demo-booking search outcome (results, no availability, technical failure).
import { expect, type Locator, type Page } from '@playwright/test';

export type ChangeOption = 'Change dates' | 'Change occupancy' | 'Change destination' | 'Change filters';

export class ResultsPage {
  readonly page: Page;
  readonly hotelCards: Locator;
  readonly searchReference: Locator;
  readonly noResultsHeading: Locator;
  readonly noInventoryMessage: Locator;
  readonly failureAlert: Locator;
  readonly retryButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.hotelCards = page.getByRole('list', { name: 'Available hotels' }).getByRole('listitem');
    this.searchReference = page.getByText(/Search reference S-\d{4}/);
    this.noResultsHeading = page.getByRole('heading', { name: 'No hotels found' });
    this.noInventoryMessage = page.getByText('We found no matching inventory for these criteria.');
    this.failureAlert = page.getByRole('alert').filter({ hasText: "We couldn't complete your search" });
    this.retryButton = page.getByRole('button', { name: 'Try again' });
  }

  heading(count: number, destination: string): Locator {
    return this.page.getByRole('heading', { name: `${count} hotel${count === 1 ? '' : 's'} available in ${destination}` });
  }

  changeOption(name: ChangeOption): Locator {
    return this.page.getByRole('group', { name: 'Change your search' }).getByRole('button', { name });
  }

  async expectResults(count: number, destination: string): Promise<void> {
    await expect(this.heading(count, destination)).toBeVisible();
    await expect(this.hotelCards).toHaveCount(count);
  }
}
