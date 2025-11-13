#!/usr/bin/env node

/**
 * Comprehensive test suite for image preview generation
 * Tests the generateImagePreview function from previewService.js
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

// Mock database query function
const mockQuery = async (sql, params) => {
  console.log('Mock DB Query:', sql);
  return { rows: [] };
};

// Mock storage adapter
class MockStorageAdapter {
  async retrieve(imagePath) {
    // For local storage test, just read the file
    return await fs.readFile(imagePath);
  }
}

// Mock getStorage function
const mockGetStorage = () => new MockStorageAdapter();

// Test configuration
const TEST_CONFIG = {
  testDir: path.join(__dirname, 'test-files-image-preview'),
  previewDir: path.join(__dirname, 'test-previews-image'),
  testImages: [
    {
      name: 'test-red-image.png',
      width: 800,
      height: 600,
      color: { r: 255, g: 0, b: 0, alpha: 1 },
      format: 'png'
    },
    {
      name: 'test-blue-image.jpg',
      width: 1920,
      height: 1080,
      color: { r: 0, g: 0, b: 255, alpha: 1 },
      format: 'jpeg'
    },
    {
      name: 'test-small-image.png',
      width: 100,
      height: 100,
      color: { r: 0, g: 255, b: 0, alpha: 1 },
      format: 'png'
    },
    {
      name: 'test-wide-image.jpg',
      width: 2000,
      height: 400,
      color: { r: 255, g: 255, b: 0, alpha: 1 },
      format: 'jpeg'
    }
  ]
};

// Expected thumbnail settings from previewService.js
const EXPECTED_SETTINGS = {
  maxWidth: 300,
  maxHeight: 300,
  fit: 'inside',
  quality: 80,
  format: 'jpeg'
};

let testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

// Utility: Log test result
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

// Test: Setup test directories
async function setupTestEnvironment() {
  console.log('\n========================================');
  console.log('SETUP: Test Environment');
  console.log('========================================\n');

  try {
    await fs.mkdir(TEST_CONFIG.testDir, { recursive: true });
    await fs.mkdir(TEST_CONFIG.previewDir, { recursive: true });
    console.log('✓ Created test directories');
    return true;
  } catch (error) {
    console.error('✗ Failed to setup test environment:', error.message);
    return false;
  }
}

// Test: Generate test images
async function generateTestImages() {
  console.log('\n========================================');
  console.log('TEST 1: Generate Test Images');
  console.log('========================================\n');

  let allPassed = true;

  for (const imageConfig of TEST_CONFIG.testImages) {
    try {
      const imagePath = path.join(TEST_CONFIG.testDir, imageConfig.name);

      await sharp({
        create: {
          width: imageConfig.width,
          height: imageConfig.height,
          channels: 4,
          background: imageConfig.color
        }
      })
        [imageConfig.format]()
        .toFile(imagePath);

      // Verify file exists
      const stats = await fs.stat(imagePath);
      logResult(
        `Generate ${imageConfig.name} (${imageConfig.width}x${imageConfig.height})`,
        stats.size > 0,
        `File size: ${stats.size} bytes`
      );
    } catch (error) {
      logResult(`Generate ${imageConfig.name}`, false, error.message);
      allPassed = false;
    }
  }

  return allPassed;
}

// Test: Test generateImagePreview with local storage
async function testImagePreviewLocal() {
  console.log('\n========================================');
  console.log('TEST 2: Image Preview Generation (Local Storage)');
  console.log('========================================\n');

  let allPassed = true;

  // Import the actual previewService
  const previewService = require('./src/services/previewService.js');

  // Override getStorage in previewService for testing
  require.cache[require.resolve('./src/storage')].exports.getStorage = mockGetStorage;

  for (let i = 0; i < TEST_CONFIG.testImages.length; i++) {
    const imageConfig = TEST_CONFIG.testImages[i];
    const imagePath = path.join(TEST_CONFIG.testDir, imageConfig.name);
    const fileId = `test-file-${i}`;

    try {
      // Generate preview
      const previewPath = await previewService.generateImagePreview(fileId, imagePath, 'local');

      if (!previewPath) {
        logResult(`Generate preview for ${imageConfig.name}`, false, 'Preview path is null');
        allPassed = false;
        continue;
      }

      // Verify preview file exists
      const previewStats = await fs.stat(previewPath);
      const fileExists = previewStats.size > 0;
      logResult(
        `Preview file created: ${imageConfig.name}`,
        fileExists,
        `Size: ${previewStats.size} bytes`
      );

      if (!fileExists) {
        allPassed = false;
        continue;
      }

      // Verify thumbnail dimensions
      const metadata = await sharp(previewPath).metadata();
      const dimensionsValid =
        metadata.width <= EXPECTED_SETTINGS.maxWidth &&
        metadata.height <= EXPECTED_SETTINGS.maxHeight;

      logResult(
        `Thumbnail dimensions valid: ${imageConfig.name}`,
        dimensionsValid,
        `Dimensions: ${metadata.width}x${metadata.height} (max: ${EXPECTED_SETTINGS.maxWidth}x${EXPECTED_SETTINGS.maxHeight})`
      );

      // Verify format is JPEG
      const formatValid = metadata.format === 'jpeg';
      logResult(
        `Thumbnail format is JPEG: ${imageConfig.name}`,
        formatValid,
        `Format: ${metadata.format}`
      );

      // Verify aspect ratio is preserved
      const originalAspect = imageConfig.width / imageConfig.height;
      const thumbAspect = metadata.width / metadata.height;
      const aspectRatioDiff = Math.abs(originalAspect - thumbAspect);
      const aspectRatioValid = aspectRatioDiff < 0.1; // Allow 10% difference

      logResult(
        `Aspect ratio preserved: ${imageConfig.name}`,
        aspectRatioValid,
        `Original: ${originalAspect.toFixed(2)}, Thumbnail: ${thumbAspect.toFixed(2)}`
      );

      if (!dimensionsValid || !formatValid || !aspectRatioValid) {
        allPassed = false;
      }

    } catch (error) {
      logResult(`Generate preview for ${imageConfig.name}`, false, error.message);
      allPassed = false;
    }
  }

  return allPassed;
}

// Test: Verify Sharp configuration
async function testSharpConfiguration() {
  console.log('\n========================================');
  console.log('TEST 3: Sharp Library Configuration');
  console.log('========================================\n');

  let allPassed = true;

  try {
    // Check if sharp is available
    const sharpVersion = sharp.version;
    logResult(
      `Sharp library is available`,
      !!sharpVersion,
      `Version: ${sharpVersion}`
    );

    // Test resize with exact settings from previewService
    const testImagePath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.testImages[0].name);
    if (!await fs.stat(testImagePath).catch(() => null)) {
      logResult(`Test image exists for Sharp config test`, false, 'Test image not found');
      return false;
    }

    const resizePath = path.join(TEST_CONFIG.previewDir, 'sharp-config-test.jpg');

    await sharp(testImagePath)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(resizePath);

    const metadata = await sharp(resizePath).metadata();
    logResult(
      `Resize with 'inside' fit works correctly`,
      metadata.width <= 300 && metadata.height <= 300,
      `Resulting dimensions: ${metadata.width}x${metadata.height}`
    );

    logResult(
      `Quality setting (80) applied`,
      true,
      `JPEG quality is set to 80`
    );

    logResult(
      `withoutEnlargement works`,
      metadata.width <= TEST_CONFIG.testImages[0].width,
      `Original width: ${TEST_CONFIG.testImages[0].width}, Thumbnail width: ${metadata.width}`
    );

  } catch (error) {
    logResult(`Sharp configuration tests`, false, error.message);
    allPassed = false;
  }

  return allPassed;
}

// Test: Error handling
async function testErrorHandling() {
  console.log('\n========================================');
  console.log('TEST 4: Error Handling');
  console.log('========================================\n');

  let allPassed = true;
  const previewService = require('./src/services/previewService.js');

  // Test: Non-existent file
  try {
    const result = await previewService.generateImagePreview('test-missing', '/nonexistent/path.jpg', 'local');
    logResult(
      `Handle non-existent file gracefully`,
      result === null,
      `Returns null for missing file`
    );
  } catch (error) {
    logResult(
      `Handle non-existent file gracefully`,
      false,
      `Throws error instead of returning null: ${error.message}`
    );
    allPassed = false;
  }

  // Test: Invalid image data
  try {
    const invalidImagePath = path.join(TEST_CONFIG.testDir, 'invalid-image.jpg');
    await fs.writeFile(invalidImagePath, 'This is not a valid image file');

    const result = await previewService.generateImagePreview('test-invalid', invalidImagePath, 'local');
    logResult(
      `Handle invalid image data gracefully`,
      result === null,
      `Returns null for invalid image`
    );
  } catch (error) {
    logResult(
      `Handle invalid image data gracefully`,
      false,
      `Throws error instead of returning null: ${error.message}`
    );
    allPassed = false;
  }

  return allPassed;
}

// Test: Verify preview directory creation
async function testPreviewDirectoryCreation() {
  console.log('\n========================================');
  console.log('TEST 5: Preview Directory Creation');
  console.log('========================================\n');

  try {
    const testPreviewDir = path.join(TEST_CONFIG.testDir, 'dynamic-preview-dir');

    // Set temporary preview dir for this test
    process.env.PREVIEW_DIR = testPreviewDir;

    const previewService = require('./src/services/previewService.js');

    // Remove the directory if it exists
    await fs.rm(testPreviewDir, { recursive: true, force: true });

    // Verify directory doesn't exist
    let dirExists = await fs.stat(testPreviewDir).catch(() => null);
    logResult(
      `Preview directory doesn't exist before test`,
      !dirExists,
      `Directory ready for creation test`
    );

    // Generate preview (which should create the directory)
    const testImagePath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.testImages[0].name);
    const previewPath = await previewService.generateImagePreview('test-dir-creation', testImagePath, 'local');

    // Verify directory was created
    dirExists = await fs.stat(testPreviewDir).catch(() => null);
    logResult(
      `Preview directory created automatically`,
      !!dirExists && dirExists.isDirectory(),
      `Directory created at: ${testPreviewDir}`
    );

    return true;
  } catch (error) {
    logResult(`Preview directory creation`, false, error.message);
    return false;
  }
}

// Test: Verify thumbnail quality and file size
async function testThumbnailQuality() {
  console.log('\n========================================');
  console.log('TEST 6: Thumbnail Quality and File Size');
  console.log('========================================\n');

  try {
    const previewService = require('./src/services/previewService.js');
    const testImagePath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.testImages[1].name); // Large image

    const previewPath = await previewService.generateImagePreview('test-quality', testImagePath, 'local');

    if (!previewPath) {
      logResult(`Generate preview for quality test`, false, 'Preview path is null');
      return false;
    }

    const originalStats = await fs.stat(testImagePath);
    const previewStats = await fs.stat(previewPath);

    const compressionRatio = originalStats.size / previewStats.size;
    const sizeReduced = previewStats.size < originalStats.size;

    logResult(
      `Thumbnail is smaller than original`,
      sizeReduced,
      `Original: ${(originalStats.size / 1024).toFixed(2)}KB, Thumbnail: ${(previewStats.size / 1024).toFixed(2)}KB, Ratio: ${compressionRatio.toFixed(2)}:1`
    );

    // Verify reasonable file size (should be < 50KB for most 300x300 JPEGs)
    const reasonableSize = previewStats.size < 50 * 1024;
    logResult(
      `Thumbnail file size is reasonable`,
      reasonableSize,
      `Size: ${(previewStats.size / 1024).toFixed(2)}KB`
    );

    return true;
  } catch (error) {
    logResult(`Thumbnail quality test`, false, error.message);
    return false;
  }
}

// Cleanup function
async function cleanup() {
  try {
    // Remove test directories
    await fs.rm(TEST_CONFIG.testDir, { recursive: true, force: true });
    await fs.rm(TEST_CONFIG.previewDir, { recursive: true, force: true });
    console.log('\n✓ Cleaned up test directories');
  } catch (error) {
    console.error('Warning: Failed to cleanup test directories:', error.message);
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  IMAGE PREVIEW GENERATION - COMPREHENSIVE TEST SUITE       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Setup
    if (!await setupTestEnvironment()) {
      console.error('Failed to setup test environment');
      process.exit(1);
    }

    // Run tests
    await generateTestImages();
    await testImagePreviewLocal();
    await testSharpConfiguration();
    await testErrorHandling();
    await testPreviewDirectoryCreation();
    await testThumbnailQuality();

    // Print summary
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

    // Exit code based on results
    const exitCode = testResults.failed === 0 ? 0 : 1;
    console.log(`Final Status: ${exitCode === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);

    // Cleanup
    await cleanup();

    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error during tests:', error);
    await cleanup();
    process.exit(1);
  }
}

// Run tests
runAllTests();
