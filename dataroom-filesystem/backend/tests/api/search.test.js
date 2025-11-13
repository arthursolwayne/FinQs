const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../../src/server');

describe('Search API', () => {
  let token;

  beforeAll(async () => {
    // Create test file
    const testFilePath = path.join(__dirname, '../fixtures/search-test.txt');
    const fixturesDir = path.join(__dirname, '../fixtures');

    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    fs.writeFileSync(testFilePath, 'Searchable content');

    // Register and login
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'searchtest@example.com',
        password: 'testpassword123',
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'searchtest@example.com',
        password: 'testpassword123',
      });

    token = loginRes.body.token;

    // Upload a test file
    await request(app)
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', testFilePath);
  });

  describe('GET /api/search', () => {
    it('should search files by name', async () => {
      const res = await request(app)
        .get('/api/search?q=search')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body).toHaveProperty('query', 'search');
    });

    it('should return empty results for non-matching query', async () => {
      const res = await request(app)
        .get('/api/search?q=nonexistentfile12345')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });

    it('should reject search without query', async () => {
      const res = await request(app)
        .get('/api/search')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query required');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/search?q=test&limit=5&offset=0')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeLessThanOrEqual(5);
    });

    it('should reject search without auth', async () => {
      const res = await request(app)
        .get('/api/search?q=test');

      expect(res.status).toBe(401);
    });
  });
});
