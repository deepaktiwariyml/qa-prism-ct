const home = require('../pages/HomePage');

describe('Home page', () => {
  beforeEach(() => {
    home.open();
  });

  it('displays a heading', () => {
    home.getHeading().should('be.visible');
  });
});
