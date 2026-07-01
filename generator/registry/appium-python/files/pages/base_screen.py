"""BaseScreen: shared interactions for every screen object (POM for mobile)."""
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class BaseScreen:
    def __init__(self, driver) -> None:
        self.driver = driver
        self.wait = WebDriverWait(driver, 15)

    def find(self, accessibility_id: str):
        """Prefer accessibility ids — the most stable mobile locator."""
        return self.wait.until(
            EC.presence_of_element_located((AppiumBy.ACCESSIBILITY_ID, accessibility_id))
        )

    def tap(self, accessibility_id: str) -> None:
        self.find(accessibility_id).click()

    def type_text(self, accessibility_id: str, text: str) -> None:
        self.find(accessibility_id).send_keys(text)
