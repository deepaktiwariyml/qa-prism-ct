import { test as base } from '@playwright/test';
import { HomePage } from '../pages/HomePage.js';
import { ApiClient } from '../api/ApiClient.js';

/**
 * Custom fixtures extend Playwright's base test so that page objects
 * and the API client are constructed once and injected automatically.
 *
 * Usage:
 *   import { test, expect } from '@fixtures/test-fixtures';
 *   test('example', async ({ homePage }) => { ... });
 */
type Fixtures = {
  homePage: HomePage;
  apiClient: ApiClient;
};

export const test = base.extend<Fixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  apiClient: async ({ request }, use) => {
    await use(new ApiClient(request));
  },
});

export { expect } from '@playwright/test';
