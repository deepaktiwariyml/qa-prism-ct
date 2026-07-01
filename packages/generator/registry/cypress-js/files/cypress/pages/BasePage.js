/**
 * BasePage holds behaviour shared by every page object: navigation and
 * common helpers. Concrete pages extend this and expose intent-revealing
 * methods rather than raw selectors.
 */
class BasePage {
  visit(path = '/') {
    cy.visit(path);
    return this;
  }

  getByTestId(id) {
    return cy.get(`[data-testid="${id}"]`);
  }

  clickByText(text) {
    cy.contains(text).click();
    return this;
  }
}

module.exports = BasePage;
