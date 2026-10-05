import { expect, type Locator, type Page } from '@playwright/test';
import type { SearchCriteria } from './data';

// Locator preference (_WORKFLOW.md): role > label > text > testid > css/xpath.
export class SearchPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly destination: Locator;
  readonly checkIn: Locator;
  readonly checkOut: Locator;
  readonly rooms: Locator;
  readonly adults: Locator;
  readonly children: Locator;
  readonly submit: Locator;
  readonly errorSummary: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Find a hotel' });
    this.destination = page.getByLabel('Destination').first();
    this.checkIn = page.getByLabel('Check-in').first();
    this.checkOut = page.getByLabel('Check-out').first();
    this.rooms = page.getByLabel('Rooms').first();
    this.adults = page.getByLabel('Adults').first();
    this.children = page.getByLabel('Children').first();
    this.submit = page.getByRole('button', { name: 'Search hotels' }).first();
    this.errorSummary = page.getByRole('alert');
  }

  async open() {
    await this.page.goto('./');
    await expect(this.heading).toBeVisible();
  }

  async fill(c: Partial<SearchCriteria>) {
    if (c.destination !== undefined) await this.destination.fill(c.destination);
    if (c.checkIn !== undefined) await this.checkIn.fill(c.checkIn);
    if (c.checkOut !== undefined) await this.checkOut.fill(c.checkOut);
    if (c.rooms !== undefined) await this.rooms.fill(String(c.rooms));
    if (c.adults !== undefined) await this.adults.fill(String(c.adults));
    if (c.children !== undefined) await this.children.fill(String(c.children));
  }

  async search(c: Partial<SearchCriteria>) {
    await this.fill(c);
    await this.submit.click();
  }

  field(name: 'destination' | 'checkIn' | 'checkOut' | 'rooms' | 'adults' | 'children'): Locator {
    return this[name];
  }

  async expectFieldError(name: 'destination' | 'checkIn' | 'checkOut' | 'rooms' | 'adults' | 'children', message: RegExp) {
    const input = this.field(name);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(message);
  }
}
