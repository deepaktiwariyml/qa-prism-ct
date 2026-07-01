import { Page, Locator, expect } from '@playwright/test';

/**
 * BasePage holds behaviour shared by every page object:
 * navigation, waiting, and common assertions. Concrete pages
 * extend this and expose their own locators + intent-revealing methods.
 */
export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate to a path relative to the configured baseURL. */
  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  /** Wait until the network is idle — useful after navigation. */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /** Assert the page title contains the expected text. */
  async expectTitleContains(text: string): Promise<void> {
    await expect(this.page).toHaveTitle(new RegExp(text, 'i'));
  }

  /** Safe click helper that waits for the element to be actionable. */
  protected async click(locator: Locator): Promise<void> {
    await locator.waitFor({ state: 'visible' });
    await locator.click();
  }

  /** Type into a field after clearing it. */
  protected async fill(locator: Locator, value: string): Promise<void> {
    await locator.waitFor({ state: 'visible' });
    await locator.fill(value);
  }
}
