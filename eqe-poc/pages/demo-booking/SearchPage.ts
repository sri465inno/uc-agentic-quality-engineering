// Page Object: demo-booking search form. Locator preference (_WORKFLOW.md §3): role > label > text > testid > css.
import { expect, type Locator, type Page } from '@playwright/test';
import type { SearchCriteria } from '../../test-data/playbook';

export type SearchField = 'Destination' | 'Check-in' | 'Check-out' | 'Rooms' | 'Adults' | 'Children';

export class SearchPage {
  readonly page: Page;
  readonly form: Locator;
  readonly submitButton: Locator;
  readonly priceFilter: Locator;
  readonly errorSummary: Locator;
  readonly requiredHint: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.getByRole('form', { name: 'Hotel search' });
    this.submitButton = page.getByRole('button', { name: 'Search hotels' });
    this.priceFilter = page.getByLabel('Max price per night (filter)');
    this.errorSummary = page.getByRole('alert').filter({ hasText: 'Please correct' });
    this.requiredHint = page.getByText('Fields marked * are required.');
  }

  field(name: SearchField): Locator {
    const role = name === 'Rooms' || name === 'Adults' || name === 'Children' ? 'spinbutton' : 'textbox';
    return this.form.getByRole(role, { name, exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.getByRole('heading', { name: 'Find a hotel' })).toBeVisible();
  }

  async fill(c: SearchCriteria): Promise<void> {
    await this.field('Destination').fill(c.destination);
    await this.field('Check-in').fill(c.checkIn);
    await this.field('Check-out').fill(c.checkOut);
    await this.field('Rooms').fill(String(c.rooms));
    await this.field('Adults').fill(String(c.adults));
    await this.field('Children').fill(String(c.children));
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async search(c: SearchCriteria): Promise<void> {
    await this.fill(c);
    await this.submit();
  }

  async filterByMaxPrice(value: string): Promise<void> {
    await this.priceFilter.selectOption(value);
  }

  async expectCriteria(c: SearchCriteria): Promise<void> {
    await expect(this.field('Destination')).toHaveValue(c.destination);
    await expect(this.field('Check-in')).toHaveValue(c.checkIn);
    await expect(this.field('Check-out')).toHaveValue(c.checkOut);
    await expect(this.field('Rooms')).toHaveValue(String(c.rooms));
    await expect(this.field('Adults')).toHaveValue(String(c.adults));
    await expect(this.field('Children')).toHaveValue(String(c.children));
    for (const f of ['Destination', 'Check-in', 'Check-out', 'Rooms', 'Adults', 'Children'] as const) await expect(this.field(f)).toBeEditable();
  }

  async expectFieldError(name: SearchField, message: string): Promise<void> {
    await expect(this.field(name)).toHaveAttribute('aria-invalid', 'true');
    await expect(this.field(name)).toHaveAccessibleDescription(message);
  }
}
