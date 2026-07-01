import { test, expect } from '../../src/fixtures/test-fixtures.js';
import { allure } from 'allure-playwright';

test.describe('Home page', () => {
  test.beforeEach(async ({ homePage }) => {
    await homePage.open();
  });

  test('displays the hero heading', async ({ homePage }) => {
    allure.epic('Web');
    allure.feature('Home page');
    allure.severity('critical');

    await expect(homePage.heroHeading()).toBeVisible();
  });

  test('navigates to Get started', async ({ homePage, page }) => {
    allure.epic('Web');
    allure.feature('Navigation');
    allure.severity('normal');

    await homePage.clickGetStarted();
    await expect(page).toHaveURL(/.*intro/);
  });
});
