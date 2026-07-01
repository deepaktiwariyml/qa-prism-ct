import { test, expect } from '../../src/fixtures/test-fixtures.js';
import { testData } from '../../src/utils/testData.js';
import { allure } from 'allure-playwright';

test.describe('Users API', () => {
  test('GET /users returns a paginated list', async ({ apiClient }) => {
    allure.epic('API');
    allure.feature('Users');
    allure.severity('critical');

    const response = await apiClient.get('/users', { page: 2 });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('POST /users creates a user', async ({ apiClient }) => {
    allure.epic('API');
    allure.feature('Users');
    allure.severity('normal');

    const response = await apiClient.post('/users', testData.apiUser);
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.name).toBe(testData.apiUser.name);
    expect(body).toHaveProperty('id');
  });
});
