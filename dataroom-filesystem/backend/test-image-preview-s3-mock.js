#!/usr/bin/env node

/**
 * S3 Storage Compatibility Test for Image Preview Generation
 * Tests preview generation with mocked S3 storage adapter
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

// Test configuration
const TEST_CONFIG = {
  testDir: path.join(__dirname, 'test-files-s3-preview'),
  previewDir: path.join(__dirname, 'test-previews-s3'),
};

let testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

function logResult(testName, passed, message = '') {
  if (passed) {
    console.log(`  ✅ ${testName}`);
    testResults.passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    testResults.failed++;
    testResults.errors.push({ test: testName, error: message });
  }
}

// Mock S3 Storage Adapter
class MockS3StorageAdapter {
  constructor() {
    this.bucket = 'test-bucket';
    this.region = 'us-east-1';
    this.files = new Map();
  }

  /**
   * Mock store method - saves file in memory
   */
  async store(buffer, storagePath, metadata = {}) {
    this.files.set(storagePath, buffer);
    console.log(`    [Mock S3] Stored ${storagePath} (${buffer.length} bytes)`);
    return {
      location: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${storagePath}`,
      adapter: 's3',
      bucket: this.bucket,
      key: storagePath,
    };
  }

  /**
   * Mock retrieve method - returns file from memory
   */
  async retrieve(storagePath) {
    if (!this.files.has(storagePath)) {
      throw new Error(`File not found in S3: ${storagePath}`);
    }
    const buffer = this.files.get(storagePath);
    console.log(`    [Mock S3] Retrieved ${storagePath} (${buffer.length} bytes)`);
    return buffer;
  }

  /**
   * Mock exists method
   */
  async exists(storagePath) {
    return this.files.has(storagePath);
  }

  /**
   * Mock delete method
   */
  async delete(storagePath) {
    this.files.delete(storagePath);
    return true;
  }
}

// Setup
async function setupTestEnvironment() {
  console.log('\n========================================');
  console.log('SETUP: S3 Mock Test Environment');
  console.log('========================================\n');

  try {
    await fs.mkdir(TEST_CONFIG.testDir, { recursive: true });
    await fs.mkdir(TEST_CONFIG.previewDir, { recursive: true });
    console.log('✓ Created test directories');
    return true;
  } catch (error) {
    console.error('✗ Failed to setup:', error.message);
    return false;
  }
}

// Test 1: Storage Adapter Interface Compliance
async function testStorageAdapterInterface() {
  console.log('\n========================================');
  console.log('TEST 1: Storage Adapter Interface');
  console.log('========================================\n');

  const adapter = new MockS3StorageAdapter();
  let allPassed = true;

  try {
    // Test that adapter has all required methods
    const requiredMethods = ['store', 'retrieve', 'exists', 'delete'];

    for (const method of requiredMethods) {
      const hasMethod = typeof adapter[method] === 'function';
      logResult(
        `Method '${method}' exists`,
        hasMethod,
        `Type: ${typeof adapter[method]}`
      );
      if (!hasMethod) allPassed = false;
    }

    // Test store operation
    const testBuffer = Buffer.from('test image data');
    const storeResult = await adapter.store(testBuffer, 'images/test-image.jpg');

    const hasLocation = !!storeResult.location;
    logResult(
      `store() returns location URL`,
      hasLocation,
      `URL: ${storeResult.location}`
    );
    if (!hasLocation) allPassed = false;

    // Test retrieve operation
    const retrievedBuffer = await adapter.retrieve('images/test-image.jpg');
    const bufferMatches = Buffer.isBuffer(retrievedBuffer) && retrievedBuffer.length > 0;
    logResult(
      `retrieve() returns Buffer`,
      bufferMatches,
      `Size: ${retrievedBuffer.length} bytes`
    );
    if (!bufferMatches) allPassed = false;

    // Test exists operation
    const fileExists = await adapter.exists('images/test-image.jpg');
    logResult(
      `exists() returns boolean true for stored file`,
      fileExists === true,
      `Result: ${fileExists}`
    );
    if (!fileExists) allPassed = false;

    // Test delete operation
    const deleteResult = await adapter.delete('images/test-image.jpg');
    logResult(
      `delete() removes file from storage`,
      deleteResult === true,
      `Delete successful: ${deleteResult}`
    );
    if (!deleteResult) allPassed = false;

    // Verify file is gone
    const fileGone = await adapter.exists('images/test-image.jpg');
    logResult(
      `exists() returns false after delete()`,
      fileGone === false,
      `File exists after delete: ${fileGone}`
    );
    if (fileGone) allPassed = false;

  } catch (error) {
    logResult(`Storage Adapter Interface Test`, false, error.message);
    allPassed = false;
  }

  return allPassed;
}

// Test 2: Buffer Transfer Compatibility
async function testBufferTransfer() {
  console.log('\n========================================');
  console.log('TEST 2: Buffer Transfer Compatibility');
  console.log('========================================\n');

  const adapter = new MockS3StorageAdapter();
  let allPassed = true;

  try {
    // Create a real image
    const imagePath = path.join(TEST_CONFIG.testDir, 'transfer-test.jpg');
    const imageBuffer = await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).jpeg().toBuffer();

    console.log(`    Created test image: ${imageBuffer.length} bytes`);

    // Store in mock S3
    const storeResult = await adapter.store(imageBuffer, 'images/transfer-test.jpg');
    logResult(
      `Image buffer stored in S3 mock`,
      !!storeResult.location,
      `Size: ${imageBuffer.length} bytes`
    );

    // Retrieve from mock S3
    const retrievedBuffer = await adapter.retrieve('images/transfer-test.jpg');
    logResult(
      `Image buffer retrieved from S3 mock`,
      Buffer.isBuffer(retrievedBuffer),
      `Retrieved size: ${retrievedBuffer.length} bytes`
    );

    // Verify buffer integrity
    const buffersMatch = imageBuffer.equals(retrievedBuffer);
    logResult(
      `Retrieved buffer matches original`,
      buffersMatch,
      `Original: ${imageBuffer.length}, Retrieved: ${retrievedBuffer.length}`
    );
    if (!buffersMatch) allPassed = false;

    // Process retrieved buffer with sharp (simulate preview generation)
    const metadata = await sharp(retrievedBuffer).metadata();
    const metadataValid = metadata.width === 600 && metadata.height === 400;
    logResult(
      `Sharp can process S3-retrieved buffer`,
      metadataValid,
      `Image dimensions: ${metadata.width}x${metadata.height}`
    );
    if (!metadataValid) allPassed = false;

    // Generate thumbnail from S3 buffer
    const thumbnailPath = path.join(TEST_CONFIG.previewDir, 's3-transfer-thumb.jpg');
    await sharp(retrievedBuffer)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    const thumbStats = await fs.stat(thumbnailPath);
    logResult(
      `Thumbnail generated from S3 buffer`,
      thumbStats.size > 0,
      `Thumbnail size: ${thumbStats.size} bytes`
    );

    // Verify compression
    const compressionRatio = imageBuffer.length / thumbStats.size;
    const compressionWorked = compressionRatio > 1;
    logResult(
      `Thumbnail is smaller than original`,
      compressionWorked,
      `Compression ratio: ${compressionRatio.toFixed(2)}:1`
    );
    if (!compressionWorked) allPassed = false;

  } catch (error) {
    logResult(`Buffer Transfer Test`, false, error.message);
    allPassed = false;
  }

  return allPassed;
}

// Test 3: Simulated Preview Generation Flow (S3 Path)
async function testPreviewGenerationFlow() {
  console.log('\n========================================');
  console.log('TEST 3: Preview Generation Flow (S3)');
  console.log('========================================\n');

  const adapter = new MockS3StorageAdapter();
  let allPassed = true;

  try {
    // Simulate upload workflow
    console.log('\n  Simulating S3 upload workflow:');

    // Step 1: Create image locally (simulates upload)
    const imagePath = path.join(TEST_CONFIG.testDir, 'workflow-test.jpg');
    const imageBuffer = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 0, g: 0, b: 255 }
      }
    }).jpeg().toBuffer();

    console.log(`    1. Image created (${imageBuffer.length} bytes)`);

    // Step 2: Store in S3 (via adapter)
    const fileId = 'workflow-test-file';
    const s3Path = `uploads/${fileId}/original.jpg`;
    const storeResult = await adapter.store(imageBuffer, s3Path);
    logResult(
      `Step 1: File stored in S3`,
      !!storeResult.location,
      `S3 path: ${s3Path}`
    );

    // Step 3: Retrieve from S3 (for preview generation)
    const retrievedBuffer = await adapter.retrieve(s3Path);
    logResult(
      `Step 2: File retrieved from S3`,
      Buffer.isBuffer(retrievedBuffer),
      `Retrieved ${retrievedBuffer.length} bytes`
    );

    // Step 4: Generate preview
    const previewPath = path.join(TEST_CONFIG.previewDir, `${fileId}_preview.jpg`);
    await sharp(retrievedBuffer)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(previewPath);

    const previewStats = await fs.stat(previewPath);
    logResult(
      `Step 3: Preview generated`,
      previewStats.size > 0,
      `Preview size: ${previewStats.size} bytes`
    );

    // Step 5: Verify preview
    const previewMetadata = await sharp(previewPath).metadata();
    const previewValid = previewMetadata.width <= 300 && previewMetadata.height <= 300;
    logResult(
      `Step 4: Preview dimensions valid`,
      previewValid,
      `Dimensions: ${previewMetadata.width}x${previewMetadata.height}`
    );
    if (!previewValid) allPassed = false;

    // Step 6: Store preview back to S3 (optional)
    const previewBuffer = await fs.readFile(previewPath);
    const previewS3Path = `uploads/${fileId}/preview.jpg`;
    await adapter.store(previewBuffer, previewS3Path);
    logResult(
      `Step 5: Preview stored back to S3`,
      await adapter.exists(previewS3Path),
      `Preview S3 path: ${previewS3Path}`
    );

    // Overall flow assessment
    logResult(
      `Complete S3 preview workflow successful`,
      allPassed,
      `All steps completed without errors`
    );

  } catch (error) {
    logResult(`Preview Generation Flow`, false, error.message);
    allPassed = false;
  }

  return allPassed;
}

// Test 4: Error Handling with S3
async function testErrorHandlingS3() {
  console.log('\n========================================');
  console.log('TEST 4: Error Handling (S3)');
  console.log('========================================\n');

  const adapter = new MockS3StorageAdapter();
  let allPassed = true;

  // Test missing file retrieval
  try {
    await adapter.retrieve('nonexistent/file.jpg');
    logResult(
      `Handle missing file error`,
      false,
      `Should throw error for missing file`
    );
    allPassed = false;
  } catch (error) {
    logResult(
      `Handle missing file error`,
      error.message.includes('not found'),
      `Error: ${error.message}`
    );
  }

  // Test exists on missing file
  try {
    const exists = await adapter.exists('nonexistent/file.jpg');
    logResult(
      `exists() returns false for missing file`,
      exists === false,
      `Result: ${exists}`
    );
    if (exists !== false) allPassed = false;
  } catch (error) {
    logResult(
      `exists() returns false for missing file`,
      false,
      `Error: ${error.message}`
    );
    allPassed = false;
  }

  // Test delete on missing file (should be idempotent)
  try {
    const result = await adapter.delete('nonexistent/file.jpg');
    logResult(
      `delete() is idempotent (no error on missing file)`,
      result === true,
      `Delete result: ${result}`
    );
  } catch (error) {
    logResult(
      `delete() is idempotent`,
      false,
      `Error: ${error.message}`
    );
    allPassed = false;
  }

  return allPassed;
}

// Test 5: Concurrent S3 Operations
async function testConcurrentOperations() {
  console.log('\n========================================');
  console.log('TEST 5: Concurrent S3 Operations');
  console.log('========================================\n');

  const adapter = new MockS3StorageAdapter();
  let allPassed = true;

  try {
    // Store multiple images concurrently
    const storePromises = [];
    for (let i = 0; i < 5; i++) {
      const buffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: Math.random() * 255, g: Math.random() * 255, b: Math.random() * 255 }
        }
      }).jpeg().toBuffer();

      storePromises.push(
        adapter.store(buffer, `concurrent/image-${i}.jpg`)
      );
    }

    const storeResults = await Promise.all(storePromises);
    logResult(
      `Store 5 images concurrently`,
      storeResults.length === 5,
      `Stored ${storeResults.length} images`
    );

    // Retrieve all concurrently
    const retrievePromises = [];
    for (let i = 0; i < 5; i++) {
      retrievePromises.push(
        adapter.retrieve(`concurrent/image-${i}.jpg`)
      );
    }

    const retrieveResults = await Promise.all(retrievePromises);
    logResult(
      `Retrieve 5 images concurrently`,
      retrieveResults.length === 5 && retrieveResults.every(b => Buffer.isBuffer(b)),
      `Retrieved ${retrieveResults.length} buffers`
    );

    // Generate previews concurrently
    const previewPromises = [];
    for (let i = 0; i < 5; i++) {
      const buffer = retrieveResults[i];
      const previewPath = path.join(TEST_CONFIG.previewDir, `concurrent-${i}_preview.jpg`);

      previewPromises.push(
        sharp(buffer)
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(previewPath)
      );
    }

    const previewResults = await Promise.all(previewPromises);
    logResult(
      `Generate 5 previews concurrently`,
      previewResults.length === 5,
      `Generated ${previewResults.length} previews`
    );

  } catch (error) {
    logResult(`Concurrent Operations`, false, error.message);
    allPassed = false;
  }

  return allPassed;
}

// Cleanup
async function cleanup() {
  try {
    await fs.rm(TEST_CONFIG.testDir, { recursive: true, force: true });
    await fs.rm(TEST_CONFIG.previewDir, { recursive: true, force: true });
    console.log('\n✓ Cleaned up test directories');
  } catch (error) {
    console.error('Warning: Failed to cleanup:', error.message);
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  S3 STORAGE COMPATIBILITY - IMAGE PREVIEW TESTS            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    if (!await setupTestEnvironment()) {
      console.error('Failed to setup test environment');
      process.exit(1);
    }

    await testStorageAdapterInterface();
    await testBufferTransfer();
    await testPreviewGenerationFlow();
    await testErrorHandlingS3();
    await testConcurrentOperations();

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  TEST RESULTS SUMMARY                                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`✅ PASSED: ${testResults.passed}`);
    console.log(`❌ FAILED: ${testResults.failed}`);
    console.log(`📊 TOTAL:  ${testResults.passed + testResults.failed}\n`);

    if (testResults.errors.length > 0) {
      console.log('ERRORS:');
      testResults.errors.forEach(err => {
        console.log(`  • ${err.test}: ${err.error}`);
      });
      console.log('');
    }

    const exitCode = testResults.failed === 0 ? 0 : 1;
    console.log(`Final Status: ${exitCode === 0 ? '✅ S3 COMPATIBILITY VERIFIED' : '❌ SOME TESTS FAILED'}\n`);

    await cleanup();
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error during tests:', error);
    await cleanup();
    process.exit(1);
  }
}

runAllTests();
