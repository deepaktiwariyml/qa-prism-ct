package com.qaprism.tests;

import com.qaprism.api.BaseApiTest;
import org.testng.annotations.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

public class UsersApiTest extends BaseApiTest {

    @Test
    public void getUsersReturnsList() {
        given()
            .spec(spec)
            .queryParam("page", 2)
        .when()
            .get("/users")
        .then()
            .statusCode(200)
            .body("data", notNullValue());
    }

    @Test
    public void createUserReturnsCreated() {
        given()
            .spec(spec)
            .body("{\"name\":\"morpheus\",\"job\":\"leader\"}")
        .when()
            .post("/users")
        .then()
            .statusCode(201)
            .body("name", equalTo("morpheus"));
    }
}
