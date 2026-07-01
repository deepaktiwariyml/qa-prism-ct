"""Example web test using the HomePage page object + fixtures."""
import allure


@allure.feature("Home page")
def test_heading_visible(home_page):
    home_page.open()
    assert home_page.heading().is_visible()


@allure.feature("Navigation")
def test_navigate_get_started(home_page, page):
    home_page.open()
    home_page.click_get_started()
    assert "intro" in page.url
