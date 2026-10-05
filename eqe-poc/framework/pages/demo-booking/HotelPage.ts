import { type Locator, type Page } from '@playwright/test';

export class HotelPage {
  readonly page: Page;
  readonly roomsHeading: Locator;
  readonly selection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.roomsHeading = page.getByRole('heading', { name: 'Rooms and rates' });
    this.selection = page.getByRole('status').filter({ hasText: 'Room selected' });
  }

  selectRoom(name: string): Locator {
    return this.page.getByRole('button', { name: `Select ${name}` });
  }
}
