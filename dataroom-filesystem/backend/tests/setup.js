// Test setup and configuration
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/dataroom_test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.UPLOAD_DIR = './test-uploads';
process.env.PREVIEW_DIR = './test-uploads/previews';

// Increase timeout for tests
jest.setTimeout(30000);
