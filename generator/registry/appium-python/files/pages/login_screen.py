"""Example screen object. Replace accessibility ids with your app's."""
from pages.base_screen import BaseScreen


class LoginScreen(BaseScreen):
    USERNAME = "username_field"
    PASSWORD = "password_field"
    SUBMIT = "login_button"

    def login(self, username: str, password: str) -> None:
        self.type_text(self.USERNAME, username)
        self.type_text(self.PASSWORD, password)
        self.tap(self.SUBMIT)
