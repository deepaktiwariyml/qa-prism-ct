const BasePage = require('./BasePage');

/**
 * Example page object. Replace selectors/methods with your application's.
 * Prefer data-testid and role/text based selectors over brittle CSS chains.
 */
class HomePage extends BasePage {
  open() {
    return this.visit('/');
  }

  getHeading() {
    return cy.get('h1');
  }

  startCommands() {
    cy.contains('type').click();
    return this;
  }
}

module.exports = new HomePage();
