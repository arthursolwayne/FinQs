const request = require('supertest');
const app = require('../../src/server');

describe('Folders API', () => {
  let token;
  let testFolderId;
  let testSubfolderId;

  beforeAll(async () => {
    // Register and login
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'foldertest@example.com',
        password: 'testpassword123',
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'foldertest@example.com',
        password: 'testpassword123',
      });

    token = loginRes.body.token;
  });

  describe('POST /api/folders', () => {
    it('should create a folder', async () => {
      const res = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Folder' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('folder');
      expect(res.body.folder.name).toBe('Test Folder');

      testFolderId = res.body.folder.id;
    });

    it('should create a subfolder', async () => {
      const res = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Subfolder',
          parentId: testFolderId,
        });

      expect(res.status).toBe(201);
      expect(res.body.folder.parent_id).toBe(testFolderId);
      expect(res.body.folder.path).toContain('Test Folder/Subfolder');

      testSubfolderId = res.body.folder.id;
    });

    it('should reject duplicate folder name in same location', async () => {
      const res = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Folder' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already exists');
    });

    it('should reject folder creation without auth', async () => {
      const res = await request(app)
        .post('/api/folders')
        .send({ name: 'Unauthorized Folder' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/folders/:id', () => {
    it('should get folder by ID', async () => {
      const res = await request(app)
        .get(`/api/folders/${testFolderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('folder');
      expect(res.body.folder.id).toBe(testFolderId);
      expect(res.body.folder.name).toBe('Test Folder');
    });

    it('should include subfolder count', async () => {
      const res = await request(app)
        .get(`/api/folders/${testFolderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.folder).toHaveProperty('subfolder_count');
      expect(parseInt(res.body.folder.subfolder_count)).toBeGreaterThan(0);
    });
  });

  describe('GET /api/folders', () => {
    it('should list root folders', async () => {
      const res = await request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('folders');
      expect(Array.isArray(res.body.folders)).toBe(true);
    });

    it('should list subfolders of a folder', async () => {
      const res = await request(app)
        .get(`/api/folders?parentId=${testFolderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.folders.length).toBeGreaterThan(0);
      expect(res.body.folders[0].parent_id).toBe(testFolderId);
    });
  });

  describe('GET /api/folders/:id/contents', () => {
    it('should get folder contents', async () => {
      const res = await request(app)
        .get(`/api/folders/${testFolderId}/contents`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('folders');
      expect(res.body).toHaveProperty('files');
      expect(Array.isArray(res.body.folders)).toBe(true);
      expect(Array.isArray(res.body.files)).toBe(true);
    });

    it('should get root contents', async () => {
      const res = await request(app)
        .get('/api/folders/root/contents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('folders');
    });
  });

  describe('GET /api/folders/:id/tree', () => {
    it('should get folder tree', async () => {
      const res = await request(app)
        .get('/api/folders/root/tree')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tree');
      expect(Array.isArray(res.body.tree)).toBe(true);
    });
  });

  describe('GET /api/folders/:id/breadcrumbs', () => {
    it('should get breadcrumb path', async () => {
      const res = await request(app)
        .get(`/api/folders/${testSubfolderId}/breadcrumbs`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('breadcrumbs');
      expect(Array.isArray(res.body.breadcrumbs)).toBe(true);
      expect(res.body.breadcrumbs.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /api/folders/:id', () => {
    it('should rename folder', async () => {
      const res = await request(app)
        .put(`/api/folders/${testFolderId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed Folder' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('folder');
      expect(res.body.folder.name).toBe('Renamed Folder');
    });
  });

  describe('POST /api/folders/:id/move', () => {
    it('should move folder', async () => {
      // Create another folder to move into
      const createRes = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Destination Folder' });

      const destinationId = createRes.body.folder.id;

      // Move subfolder to new location
      const res = await request(app)
        .post(`/api/folders/${testSubfolderId}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parentId: destinationId });

      expect(res.status).toBe(200);
      expect(res.body.folder.parent_id).toBe(destinationId);
    });

    it('should reject moving folder to its own descendant', async () => {
      const res = await request(app)
        .post(`/api/folders/${testFolderId}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parentId: testSubfolderId });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('descendant');
    });
  });

  describe('DELETE /api/folders/:id', () => {
    it('should soft delete folder', async () => {
      const res = await request(app)
        .delete(`/api/folders/${testFolderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('should not find deleted folder', async () => {
      const res = await request(app)
        .get(`/api/folders/${testFolderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
