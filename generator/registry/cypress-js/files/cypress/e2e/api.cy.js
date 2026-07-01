describe('Posts API', () => {
  const apiBaseUrl = Cypress.env('apiBaseUrl');

  it('GET /posts/1 returns a post', () => {
    cy.request(`${apiBaseUrl}/posts/1`).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.property('id', 1);
    });
  });

  it('POST /posts creates a post', () => {
    cy.request('POST', `${apiBaseUrl}/posts`, { title: 'qa', body: 'prism', userId: 1 }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body).to.have.property('id');
    });
  });
});
