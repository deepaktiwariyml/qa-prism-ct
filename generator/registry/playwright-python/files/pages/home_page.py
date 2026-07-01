"""Example page object. Replace locators/methods with your application's.

Prefer role/text based locators (get_by_role, get_by_text) over brittle
XPath or nth-child CSS selectors.
"""
from playwright.sync_api import Page, Locator
from pages.base_page import BasePage


class HomePage(BasePage):
    def __init__(self, page: Page, base_url: str) -> None:
        super().__init__(page, base_url)

    def open(self) -> "HomePage":
        self.goto("/")
        return self

    def heading(self) -> Locator:
        return self.page.get_by_role("heading", level=1)

    def click_get_started(self) -> None:
        self.page.get_by_role("link", name="Get started").first.click()
