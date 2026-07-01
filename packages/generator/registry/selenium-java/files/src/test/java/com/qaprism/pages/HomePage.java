package com.qaprism.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/**
 * Example page object. Replace locators/methods with your application's.
 * Prefer stable locators (id, data-* attributes) over brittle XPath.
 */
public class HomePage extends BasePage {
    private final By heading = By.tagName("h1");
    private final By formAuthLink = By.linkText("Form Authentication");

    public HomePage(WebDriver driver) {
        super(driver);
    }

    public void open(String baseUrl) {
        driver.get(baseUrl + "/");
    }

    public String headingText() {
        return waitVisible(heading).getText();
    }

    public void goToFormAuth() {
        click(formAuthLink);
    }
}
