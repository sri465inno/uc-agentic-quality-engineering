import { expect, type Locator, type Page } from '@playwright/test';

export class ResultsPage {
  readonly page: Page;
  readonly criteriaSummary: Locator;
  readonly modifySearch: Locator;
  readonly countHeading: Locator;
  readonly results: Locator;
  readonly hotelCards: Locator;
  readonly sortBy: Locator;
  readonly maxPrice: Locator;
  readonly stars: Locator;
  readonly activeFilters: Locator;
  readonly resetFilters: Locator;
  readonly showMore: Locator;
  readonly noResultsHeading: Locator;
  readonly failureHeading: Locator;
  readonly retry: Locator;

  constructor(page: Page) {
    this.page = page;
    this.criteriaSummary = page.getByRole('region', { name: 'Your search' });
    this.modifySearch = page.getByRole('button', { name: 'Modify search' });
    this.countHeading = page.getByRole('heading', { name: /hotels? found/ });
    this.results = page.getByRole('region', { name: 'Results' });
    this.hotelCards = this.results.getByRole('listitem');
    this.sortBy = page.getByLabel('Sort by');
    this.maxPrice = page.getByLabel('Maximum price per night');
    this.stars = page.getByLabel('Stars');
    this.activeFilters = page.getByLabel('Active filters');
    this.resetFilters = page.getByRole('button', { name: 'Reset filters' });
    this.showMore = page.getByRole('button', { name: 'Show more hotels' });
    this.noResultsHeading = page.getByRole('heading', { name: /No hotels match your search/ });
    this.failureHeading = page.getByRole('heading', { name: /couldn't complete your search/ });
    this.retry = page.getByRole('button', { name: 'Try again' });
  }

  changeButton(what: 'dates' | 'occupancy' | 'destination'): Locator {
    return this.page.getByRole('button', { name: `Change ${what}` });
  }

  card(name: string): Locator {
    return this.results.getByRole('listitem', { name });
  }

  amenity(name: string): Locator {
    return this.page.getByRole('checkbox', { name });
  }

  async expectResultsListed() {
    await expect(this.countHeading).toBeVisible();
    await expect(this.hotelCards.first()).toBeVisible();
  }

  async prices(): Promise<number[]> {
    const texts = await this.results.getByText(/^From /).allInnerTexts();
    return texts.map((t) => Number(t.replace(/[^0-9.]/g, '')));
  }
}
