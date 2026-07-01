"""Example API test using Playwright's APIRequestContext via the request fixture."""
import allure
from playwright.sync_api import Playwright
from utils.test_data import API_USER


@allure.feature("Users API")
def test_list_users(playwright: Playwright, api_base_url):
    request = playwright.request.new_context(base_url=api_base_url)
    response = request.get("/users", params={"page": 2})
    assert response.status == 200
    body = response.json()
    assert "data" in body
    request.dispose()


@allure.feature("Users API")
def test_create_user(playwright: Playwright, api_base_url):
    request = playwright.request.new_context(base_url=api_base_url)
    response = request.post("/users", data=API_USER)
    assert response.status == 201
    assert response.json()["name"] == API_USER["name"]
    request.dispose()
