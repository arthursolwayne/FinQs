const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../../src/server');

describe('Files API', () => {
  let token;
  let userId;
  let testFileId;

  // Create a test file
  const testFilePath = path.join(__dirname, '../fixtures/test.txt');
  const testFileContent = 'This is a test file for API testing';

  beforeAll(async () => {
    // Create test fixtures directory
    const fixturesDir = path.join(__dirname, '../fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Create test file
    fs.writeFileSync(testFilePath, testFileContent);

    // Register and login
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'filetest@example.com',
        password: 'testpassword123',
      });

    userId = registerRes.body.user.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'filetest@example.com',
        password: 'testpassword123',
      });

    token = loginRes.body.token;
  });

  afterAll(() => {
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe('POST /api/files/upload', () => {
    it('should upload a file', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', testFilePath);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('file');
      expect(res.body.file).toHaveProperty('id');
      expect(res.body.file.original_name).toBe('test.txt');

      testFileId = res.body.file.id;
    });

    it('should reject upload without token', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .attach('file', testFilePath);

      expect(res.status).toBe(401);
    });

    it('should reject upload without file', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No file');
    });
  });

  describe('GET /api/files/:id', () => {
    it('should get file metadata', async () => {
      const res = await request(app)
        .get(`/api/files/${testFileId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('file');
      expect(res.body.file.id).toBe(testFileId);
      expect(res.body.file.original_name).toBe('test.txt');
    });

    it('should reject request for non-existent file', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/files/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should reject request with invalid UUID', async () => {
      const res = await request(app)
        .get('/api/files/invalid-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/files', () => {
    it('should list files', async () => {
      const res = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('files');
      expect(Array.isArray(res.body.files)).toBe(true);
      expect(res.body.files.length).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/files?limit=1&offset=0')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.files.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/files/:id/download', () => {
    it('should download file', async () => {
      const res = await request(app)
        .get(`/api/files/${testFileId}/download`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/plain');
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('should soft delete file', async () => {
      const res = await request(app)
        .delete(`/api/files/${testFileId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('should not find deleted file', async () => {
      const res = await request(app)
        .get(`/api/files/${testFileId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/files/:id/restore', () => {
    it('should restore deleted file', async () => {
      const res = await request(app)
        .post(`/api/files/${testFileId}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('file');
    });

    it('should find restored file', async () => {
      const res = await request(app)
        .get(`/api/files/${testFileId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.file.id).toBe(testFileId);
    });
  });

  describe('GET /api/files/stats/storage', () => {
    it('should get storage statistics', async () => {
      const res = await request(app)
        .get('/api/files/stats/storage')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('stats');
      expect(res.body.stats).toHaveProperty('totalFiles');
      expect(res.body.stats).toHaveProperty('storageUsed');
      expect(res.body.stats).toHaveProperty('storageQuota');
    });
  });
});
