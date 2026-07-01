package com.qaprism.tests;

import com.qaprism.base.BaseTest;
import com.qaprism.pages.HomePage;
import org.testng.Assert;
import org.testng.annotations.Test;

public class HomeTest extends BaseTest {

    @Test
    public void headingIsVisible() {
        HomePage home = new HomePage(driver);
        home.open(baseUrl);
        Assert.assertFalse(home.headingText().isEmpty(), "Heading should not be empty");
    }
}
