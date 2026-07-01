"""BasePage: navigation and helpers shared by every page object."""
from playwright.sync_api import Page


class BasePage:
    def __init__(self, page: Page, base_url: str) -> None:
        self.page = page
        self.base_url = base_url

    def goto(self, path: str = "/") -> None:
        self.page.goto(f"{self.base_url}{path}")

    def title(self) -> str:
        return self.page.title()
