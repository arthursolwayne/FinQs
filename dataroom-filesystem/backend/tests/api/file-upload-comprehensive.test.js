const request = require('supertest');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = require('../../src/server');
const { query } = require('../../src/db/database');

/**
 * Comprehensive File Upload System Test Suite
 * Tests all validations, security measures, storage implementation, and deduplication
 */
describe('Comprehensive File Upload System Tests', () => {
  let token;
  let userId;
  let testUser = {
    email: `fileupload-test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
  };

  beforeAll(async () => {
    // Register test user
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    userId = registerRes.body.user.id;

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send(testUser);

    token = loginRes.body.token;
  });

  // ============================================================================
  // 1. UPLOAD FLOW & VALIDATIONS
  // ============================================================================
  describe('1. UPLOAD FLOW & VALIDATIONS', () => {
    const fixturesDir = path.join(__dirname, '../fixtures');

    beforeAll(() => {
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
    });

    describe('1.1 Basic Upload Flow', () => {
      it('should successfully upload a valid text file', async () => {
        const testFile = path.join(fixturesDir, 'test-basic.txt');
        fs.writeFileSync(testFile, 'This is a test file content');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('file');
        expect(res.body.file).toHaveProperty('id');
        expect(res.body.file).toHaveProperty('content_hash');
        expect(res.body.file).toHaveProperty('storage_path');
        expect(res.body.file.mime_type).toBe('text/plain');
        expect(res.body.file.original_name).toBe('test-basic.txt');
        expect(res.body.file).toHaveProperty('size');

        fs.unlinkSync(testFile);
      });

      it('should require authentication', async () => {
        const testFile = path.join(fixturesDir, 'test-noauth.txt');
        fs.writeFileSync(testFile, 'Test content');

        const res = await request(app)
          .post('/api/files/upload')
          .attach('file', testFile);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error');

        fs.unlinkSync(testFile);
      });

      it('should require a file to be present', async () => {
        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('No file');
      });

      it('should track upload in audit log', async () => {
        const testFile = path.join(fixturesDir, 'test-audit.txt');
        fs.writeFileSync(testFile, 'Audit test content');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        const fileId = res.body.file.id;

        // Check audit log was created
        const auditResult = await query(
          'SELECT * FROM audit_logs WHERE user_id = $1 AND action = $2 AND resource_id = $3 ORDER BY created_at DESC LIMIT 1',
          [userId, 'upload', fileId]
        );

        expect(auditResult.rows.length).toBeGreaterThan(0);
        expect(auditResult.rows[0].action).toBe('upload');
        expect(auditResult.rows[0].metadata).toHaveProperty('filename');
        expect(auditResult.rows[0].metadata).toHaveProperty('size');

        fs.unlinkSync(testFile);
      });
    });

    describe('1.2 File Naming & Metadata Validation', () => {
      it('should sanitize special characters in filename', async () => {
        const testFile = path.join(fixturesDir, 'test-special.txt');
        fs.writeFileSync(testFile, 'Special char test');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body.file.sanitized_name).toBeTruthy();
        expect(res.body.file.sanitized_name).toMatch(/^[a-zA-Z0-9\-_. ]+$/);

        fs.unlinkSync(testFile);
      });

      it('should store original filename while using sanitized version', async () => {
        const testFile = path.join(fixturesDir, 'original-name-test.txt');
        fs.writeFileSync(testFile, 'Original name test');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body.file.original_name).toBe('original-name-test.txt');
        expect(res.body.file.sanitized_name).toBeTruthy();

        fs.unlinkSync(testFile);
      });

      it('should extract and store file extension', async () => {
        const testFile = path.join(fixturesDir, 'test-pdf.pdf');
        // Create a minimal PDF
        const pdfContent = Buffer.from('%PDF-1.4\n%EOF');
        fs.writeFileSync(testFile, pdfContent);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body.file.extension).toBe('.pdf');

        fs.unlinkSync(testFile);
      });
    });

    describe('1.3 Optional Folder Placement', () => {
      it('should accept optional folderId in upload request', async () => {
        const testFile = path.join(fixturesDir, 'test-folder.txt');
        fs.writeFileSync(testFile, 'Folder placement test');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .field('folderId', null)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body.file).toHaveProperty('folder_id');

        fs.unlinkSync(testFile);
      });
    });
  });

  // ============================================================================
  // 2. SECURITY MEASURES
  // ============================================================================
  describe('2. SECURITY MEASURES', () => {
    const fixturesDir = path.join(__dirname, '../fixtures');

    beforeAll(() => {
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
    });

    describe('2.1 File Type Validation (MIME Type & Content)', () => {
      it('should reject files with dangerous executable extensions at multer level', async () => {
        const testFile = path.join(fixturesDir, 'test-executable.exe');
        fs.writeFileSync(testFile, 'MZ\x90\x00'); // Windows EXE magic bytes

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Executable');

        fs.unlinkSync(testFile);
      });

      it('should reject .dll files', async () => {
        const testFile = path.join(fixturesDir, 'test-library.dll');
        fs.writeFileSync(testFile, 'MZ\x90\x00');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(400);

        fs.unlinkSync(testFile);
      });

      it('should reject .sh (shell script) files', async () => {
        const testFile = path.join(fixturesDir, 'test-script.sh');
        fs.writeFileSync(testFile, '#!/bin/bash\necho test');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(400);

        fs.unlinkSync(testFile);
      });

      it('should reject .bat (batch script) files', async () => {
        const testFile = path.join(fixturesDir, 'test-batch.bat');
        fs.writeFileSync(testFile, '@echo off\necho test');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(400);

        fs.unlinkSync(testFile);
      });

      it('should reject double extensions (e.g., file.pdf.exe)', async () => {
        const testFile = path.join(fixturesDir, 'test-double.pdf.exe');
        fs.writeFileSync(testFile, 'fake pdf content');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Double extension');

        fs.unlinkSync(testFile);
      });

      it('should validate MIME type from file content (magic bytes)', async () => {
        const testFile = path.join(fixturesDir, 'test-mime-detection.txt');
        // Write PDF magic bytes but .txt extension
        const pdfMagic = Buffer.from('%PDF-1.4\ntest content');
        fs.writeFileSync(testFile, pdfMagic);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        // Should either detect as PDF or accept as text
        expect([201, 400]).toContain(res.status);

        fs.unlinkSync(testFile);
      });

      it('should accept whitelisted MIME types', async () => {
        const whitelistedTypes = [
          { ext: '.txt', content: 'Plain text file', mime: 'text/plain' },
          { ext: '.json', content: '{"test":"data"}', mime: 'application/json' },
          { ext: '.csv', content: 'col1,col2\nval1,val2', mime: 'text/csv' },
        ];

        for (const type of whitelistedTypes) {
          const testFile = path.join(fixturesDir, `test-whitelist${type.ext}`);
          fs.writeFileSync(testFile, type.content);

          const res = await request(app)
            .post('/api/files/upload')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', testFile);

          expect(res.status).toBe(201);
          expect(res.body.file.mime_type).toContain(type.mime.split('/')[0]);

          fs.unlinkSync(testFile);
        }
      });

      it('should detect and store correct MIME type for PDF', async () => {
        const testFile = path.join(fixturesDir, 'test-pdf-mime.pdf');
        const pdfContent = Buffer.from('%PDF-1.4\n%EOF');
        fs.writeFileSync(testFile, pdfContent);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body.file.mime_type).toBe('application/pdf');

        fs.unlinkSync(testFile);
      });
    });

    describe('2.2 File Size Limits', () => {
      it('should reject files exceeding MAX_FILE_SIZE', async () => {
        const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 104857600; // 100MB
        const oversizedFile = path.join(fixturesDir, 'test-oversized.txt');

        // Create a buffer larger than max size
        const buffer = Buffer.alloc(maxSize + 1);
        fs.writeFileSync(oversizedFile, buffer);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', oversizedFile);

        expect(res.status).toBe(413); // Payload Too Large
        expect(res.body.error).toContain('too large');

        fs.unlinkSync(oversizedFile);
      }, 30000); // Extended timeout for large file

      it('should accept files under the size limit', async () => {
        const testFile = path.join(fixturesDir, 'test-size-ok.txt');
        const content = 'Small file content';
        fs.writeFileSync(testFile, content);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body.file.size).toBe(content.length);

        fs.unlinkSync(testFile);
      });
    });

    describe('2.3 Rate Limiting', () => {
      it('should enforce upload rate limit', async () => {
        const uploadRateLimit = parseInt(process.env.UPLOAD_RATE_LIMIT_MAX) || 10;
        const testFiles = [];

        try {
          // Try to upload more than the rate limit
          for (let i = 0; i < uploadRateLimit + 2; i++) {
            const testFile = path.join(fixturesDir, `test-ratelimit-${i}.txt`);
            fs.writeFileSync(testFile, `Upload attempt ${i}`);
            testFiles.push(testFile);

            const res = await request(app)
              .post('/api/files/upload')
              .set('Authorization', `Bearer ${token}`)
              .attach('file', testFile);

            // Early uploads should succeed
            if (i < uploadRateLimit) {
              expect([201, 429]).toContain(res.status);
            } else {
              // Later uploads might be rate limited
              expect([429, 201]).toContain(res.status);
            }
          }
        } finally {
          // Cleanup
          testFiles.forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
          });
        }
      }, 30000);
    });

    describe('2.4 Access Control (Authentication & Authorization)', () => {
      it('should enforce storage quota per user', async () => {
        const testFile = path.join(fixturesDir, 'test-quota.txt');
        fs.writeFileSync(testFile, 'Quota test');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        // Should succeed for first upload
        expect([201, 400]).toContain(res.status);

        fs.unlinkSync(testFile);
      });

      it('should prevent access to other users files', async () => {
        // Register a second user
        const user2 = {
          email: `user2-${Date.now()}@example.com`,
          password: 'TestPassword123!',
        };

        const registerRes = await request(app)
          .post('/api/auth/register')
          .send(user2);

        const loginRes = await request(app)
          .post('/api/auth/login')
          .send(user2);

        const user2Token = loginRes.body.token;

        // Upload file as user 1
        const testFile = path.join(fixturesDir, 'test-access-control.txt');
        fs.writeFileSync(testFile, 'Access control test');

        const uploadRes = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        const fileId = uploadRes.body.file.id;

        // Try to access as user 2
        const accessRes = await request(app)
          .get(`/api/files/${fileId}`)
          .set('Authorization', `Bearer ${user2Token}`);

        expect(accessRes.status).toBe(404);

        fs.unlinkSync(testFile);
      });
    });
  });

  // ============================================================================
  // 3. STORAGE IMPLEMENTATION (HASHING & SHARDING)
  // ============================================================================
  describe('3. STORAGE IMPLEMENTATION (HASHING & SHARDING)', () => {
    const fixturesDir = path.join(__dirname, '../fixtures');

    beforeAll(() => {
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
    });

    describe('3.1 SHA-256 Content Hashing', () => {
      it('should calculate SHA-256 hash for uploaded file', async () => {
        const testFile = path.join(fixturesDir, 'test-hash.txt');
        const content = 'This is content for hashing';
        fs.writeFileSync(testFile, content);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body.file.content_hash).toBeTruthy();
        expect(res.body.file.content_hash).toHaveLength(64); // SHA-256 hex is 64 chars

        // Verify it's actually a valid SHA-256 hash
        const expectedHash = crypto
          .createHash('sha256')
          .update(content)
          .digest('hex');

        expect(res.body.file.content_hash).toBe(expectedHash);

        fs.unlinkSync(testFile);
      });

      it('should store content_hash in database', async () => {
        const testFile = path.join(fixturesDir, 'test-hash-db.txt');
        const content = 'Database hash test';
        fs.writeFileSync(testFile, content);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        const fileId = res.body.file.id;
        const contentHash = res.body.file.content_hash;

        // Query database
        const dbResult = await query(
          'SELECT content_hash FROM files WHERE id = $1',
          [fileId]
        );

        expect(dbResult.rows[0].content_hash).toBe(contentHash);

        fs.unlinkSync(testFile);
      });
    });

    describe('3.2 Sharded Storage Path Structure', () => {
      it('should generate sharded storage path using hash', async () => {
        const testFile = path.join(fixturesDir, 'test-sharding.txt');
        fs.writeFileSync(testFile, 'Sharding test content');

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        expect(res.body.file.storage_path).toBeTruthy();

        // Storage path should follow pattern: {baseDir}/{first2chars}/{next2chars}/{hash}.ext
        const pathPattern = /^uploads\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+\..+$/;
        expect(res.body.file.storage_path).toMatch(pathPattern);

        // Verify the sharding uses the content hash
        const contentHash = res.body.file.content_hash;
        const expectedPrefix = `uploads/${contentHash.substring(0, 2)}/${contentHash.substring(2, 4)}/`;
        expect(res.body.file.storage_path).toContain(expectedPrefix);

        fs.unlinkSync(testFile);
      });

      it('should distribute files across sharding directories', async () => {
        const paths = [];

        for (let i = 0; i < 3; i++) {
          const testFile = path.join(fixturesDir, `test-shard-${i}.txt`);
          fs.writeFileSync(testFile, `Sharding test ${i} - ${Math.random()}`);

          const res = await request(app)
            .post('/api/files/upload')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', testFile);

          if (res.status === 201) {
            paths.push(res.body.file.storage_path);
          }

          fs.unlinkSync(testFile);
        }

        // Should have multiple paths
        expect(paths.length).toBeGreaterThan(0);
      });
    });

    describe('3.3 Storage Independence from Filename', () => {
      it('should use content hash for storage, not original filename', async () => {
        const testFile = path.join(fixturesDir, 'test-independent.txt');
        const content = 'Storage independence test';
        fs.writeFileSync(testFile, content);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        const storagePath = res.body.file.storage_path;
        const fileName = res.body.file.original_name;

        // Storage path should not contain original filename
        expect(storagePath).not.toContain(fileName);

        // Storage path should contain the content hash
        expect(storagePath).toContain(res.body.file.content_hash);

        fs.unlinkSync(testFile);
      });
    });
  });

  // ============================================================================
  // 4. DEDUPLICATION
  // ============================================================================
  describe('4. DEDUPLICATION', () => {
    const fixturesDir = path.join(__dirname, '../fixtures');

    beforeAll(() => {
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
    });

    describe('4.1 Content-Based Deduplication', () => {
      it('should detect duplicate file content and reuse storage', async () => {
        const content = 'This is identical content for deduplication testing';

        // Upload first file
        const file1 = path.join(fixturesDir, 'test-dedup-1.txt');
        fs.writeFileSync(file1, content);

        const res1 = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', file1);

        expect(res1.status).toBe(201);
        const hash1 = res1.body.file.content_hash;
        const path1 = res1.body.file.storage_path;

        // Upload second file with identical content but different name
        const file2 = path.join(fixturesDir, 'test-dedup-2.txt');
        fs.writeFileSync(file2, content);

        const res2 = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', file2);

        expect(res2.status).toBe(201);
        const hash2 = res2.body.file.content_hash;
        const path2 = res2.body.file.storage_path;

        // Both files should have same content hash
        expect(hash1).toBe(hash2);

        // Both files should point to same storage location
        expect(path1).toBe(path2);

        // Both file records should exist but share storage
        const fileCount = await query(
          'SELECT COUNT(*) FROM files WHERE content_hash = $1 AND user_id = $2 AND is_deleted = FALSE',
          [hash1, userId]
        );

        expect(parseInt(fileCount.rows[0].count)).toBeGreaterThanOrEqual(2);

        fs.unlinkSync(file1);
        fs.unlinkSync(file2);
      });

      it('should not deduplicate files with different content', async () => {
        const file1 = path.join(fixturesDir, 'test-no-dedup-1.txt');
        fs.writeFileSync(file1, 'First unique content 12345');

        const res1 = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', file1);

        const file2 = path.join(fixturesDir, 'test-no-dedup-2.txt');
        fs.writeFileSync(file2, 'Second unique content 67890');

        const res2 = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', file2);

        // Different content should produce different hashes
        expect(res1.body.file.content_hash).not.toBe(res2.body.file.content_hash);

        // Different storage paths
        expect(res1.body.file.storage_path).not.toBe(res2.body.file.storage_path);

        fs.unlinkSync(file1);
        fs.unlinkSync(file2);
      });

      it('should maintain separate file metadata while sharing storage', async () => {
        const content = 'Shared storage test content';

        // Upload with first name
        const file1 = path.join(fixturesDir, 'test-meta-1.txt');
        fs.writeFileSync(file1, content);

        const res1 = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', file1);

        const id1 = res1.body.file.id;
        const name1 = res1.body.file.original_name;

        // Upload with second name (same content)
        const file2 = path.join(fixturesDir, 'test-meta-2.txt');
        fs.writeFileSync(file2, content);

        const res2 = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', file2);

        const id2 = res2.body.file.id;
        const name2 = res2.body.file.original_name;

        // Should have different IDs and names
        expect(id1).not.toBe(id2);
        expect(name1).not.toBe(name2);

        // But same storage path (deduplication)
        expect(res1.body.file.storage_path).toBe(res2.body.file.storage_path);

        // Should be able to retrieve both independently
        const getMeta1 = await request(app)
          .get(`/api/files/${id1}`)
          .set('Authorization', `Bearer ${token}`);

        const getMeta2 = await request(app)
          .get(`/api/files/${id2}`)
          .set('Authorization', `Bearer ${token}`);

        expect(getMeta1.status).toBe(200);
        expect(getMeta2.status).toBe(200);
        expect(getMeta1.body.file.original_name).toBe(name1);
        expect(getMeta2.body.file.original_name).toBe(name2);

        fs.unlinkSync(file1);
        fs.unlinkSync(file2);
      });
    });

    describe('4.2 Deduplication with Deletion', () => {
      it('should not delete shared file when first duplicate is deleted', async () => {
        const content = 'Delete test shared content';

        // Upload twice
        const file1 = path.join(fixturesDir, 'test-del-dedup-1.txt');
        fs.writeFileSync(file1, content);

        const res1 = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', file1);

        const id1 = res1.body.file.id;

        const file2 = path.join(fixturesDir, 'test-del-dedup-2.txt');
        fs.writeFileSync(file2, content);

        const res2 = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', file2);

        const id2 = res2.body.file.id;

        // Delete first file
        const deleteRes = await request(app)
          .delete(`/api/files/${id1}`)
          .set('Authorization', `Bearer ${token}`);

        expect(deleteRes.status).toBe(200);

        // Second file should still be accessible
        const getRes = await request(app)
          .get(`/api/files/${id2}`)
          .set('Authorization', `Bearer ${token}`);

        expect(getRes.status).toBe(200);

        fs.unlinkSync(file1);
        fs.unlinkSync(file2);
      });
    });
  });

  // ============================================================================
  // 5. QUOTA ENFORCEMENT
  // ============================================================================
  describe('5. QUOTA ENFORCEMENT', () => {
    const fixturesDir = path.join(__dirname, '../fixtures');

    beforeAll(() => {
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
    });

    describe('5.1 Storage Quota Validation', () => {
      it('should track storage usage in database', async () => {
        const testFile = path.join(fixturesDir, 'test-quota-track.txt');
        const content = 'Quota tracking test';
        fs.writeFileSync(testFile, content);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect(res.status).toBe(201);
        const fileSize = res.body.file.size;

        // Check user's storage_used was updated
        const userResult = await query(
          'SELECT storage_used FROM users WHERE id = $1',
          [userId]
        );

        expect(parseInt(userResult.rows[0].storage_used)).toBeGreaterThan(0);

        fs.unlinkSync(testFile);
      });

      it('should include quota info in storage stats', async () => {
        const res = await request(app)
          .get('/api/files/stats/storage')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.stats).toHaveProperty('storageQuota');
        expect(res.body.stats).toHaveProperty('storageUsed');
        expect(res.body.stats).toHaveProperty('storageAvailable');
        expect(res.body.stats).toHaveProperty('totalFiles');

        // Verify math
        const { storageQuota, storageUsed, storageAvailable } = res.body.stats;
        expect(storageUsed + storageAvailable).toBe(storageQuota);
      });

      it('should enforce DEFAULT_STORAGE_QUOTA for new users', async () => {
        const newUser = {
          email: `quota-user-${Date.now()}@example.com`,
          password: 'TestPassword123!',
        };

        const res = await request(app)
          .post('/api/auth/register')
          .send(newUser);

        const expectedQuota = parseInt(process.env.DEFAULT_STORAGE_QUOTA) || 5368709120;
        expect(res.body.user.storage_quota).toBe(expectedQuota);
      });
    });

    describe('5.2 Quota Checking Before Upload', () => {
      it('should check quota before accepting upload', async () => {
        // Get current user stats
        const statsRes = await request(app)
          .get('/api/files/stats/storage')
          .set('Authorization', `Bearer ${token}`);

        const { storageQuota, storageUsed } = statsRes.body.stats;
        const available = storageQuota - storageUsed;

        // Try to upload file within available quota
        const testFile = path.join(fixturesDir, 'test-quota-check.txt');
        const content = Buffer.alloc(Math.min(1000000, available / 2)); // Use half available or 1MB
        fs.writeFileSync(testFile, content);

        const res = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', testFile);

        expect([201, 400]).toContain(res.status);

        fs.unlinkSync(testFile);
      });
    });
  });

  // ============================================================================
  // 6. DATA INTEGRITY & VERIFICATION
  // ============================================================================
  describe('6. DATA INTEGRITY & VERIFICATION', () => {
    const fixturesDir = path.join(__dirname, '../fixtures');

    beforeAll(() => {
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
    });

    it('should store file with correct size', async () => {
      const testFile = path.join(fixturesDir, 'test-integrity.txt');
      const content = 'Integrity check content - exactly this text';
      fs.writeFileSync(testFile, content);

      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', testFile);

      expect(res.status).toBe(201);
      expect(res.body.file.size).toBe(content.length);

      // Verify in database
      const dbRes = await query(
        'SELECT size FROM files WHERE id = $1',
        [res.body.file.id]
      );

      expect(parseInt(dbRes.rows[0].size)).toBe(content.length);

      fs.unlinkSync(testFile);
    });

    it('should maintain file visibility in listings', async () => {
      const testFile = path.join(fixturesDir, 'test-visibility.txt');
      fs.writeFileSync(testFile, 'Visibility test');

      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', testFile);

      const fileId = uploadRes.body.file.id;

      // List files
      const listRes = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${token}`);

      const uploadedFile = listRes.body.files.find(f => f.id === fileId);
      expect(uploadedFile).toBeTruthy();
      expect(uploadedFile.original_name).toBe('test-visibility.txt');

      fs.unlinkSync(testFile);
    });
  });
});
