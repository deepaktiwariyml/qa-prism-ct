import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * Example page object for the Playwright docs site (the default baseURL).
 * Replace the locators and methods with your own application's home page.
 *
 * Locator strategy: prefer role-based and getByText locators — they are
 * resilient to markup changes. Avoid brittle XPath / nth-child selectors.
 */
export class HomePage extends BasePage {
  private readonly getStartedLink: Locator;
  private readonly searchButton: Locator;
  private readonly heroTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.getStartedLink = page.getByRole('link', { name: 'Get started' });
    this.searchButton = page.getByRole('button', { name: 'Search' });
    this.heroTitle = page.getByRole('heading', { level: 1 });
  }

  async open(): Promise<void> {
    await this.goto('/');
    await this.waitForLoad();
  }

  async clickGetStarted(): Promise<void> {
    await this.click(this.getStartedLink);
  }

  async openSearch(): Promise<void> {
    await this.click(this.searchButton);
  }

  heroHeading(): Locator {
    return this.heroTitle;
  }
}
