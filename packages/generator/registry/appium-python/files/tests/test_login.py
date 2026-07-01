"""Example mobile test. Requires a running Appium server + device/emulator."""
import allure
import pytest
from utils.driver_factory import create_driver
from pages.login_screen import LoginScreen


@pytest.fixture
def driver():
    drv = create_driver()
    yield drv
    drv.quit()


@allure.feature("Login")
@pytest.mark.skip(reason="Needs a live device/emulator — enable in your device farm")
def test_valid_login(driver):
    login = LoginScreen(driver)
    login.login("standard_user", "secret")
    assert driver.current_activity is not None
