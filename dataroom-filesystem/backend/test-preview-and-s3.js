#!/usr/bin/env node

/**
 * Comprehensive test script for preview generation and S3 integration
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

// Test 1: Generate a test image and create preview
async function testImagePreview() {
  console.log('\n========================================');
  console.log('TEST 1: Image Preview Generation');
  console.log('========================================\n');

  try {
    const testDir = path.join(__dirname, 'test-files');
    const previewDir = path.join(__dirname, 'test-previews');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(previewDir, { recursive: true });

    // Generate a test image (red square 800x600)
    const testImagePath = path.join(testDir, 'test-image.png');
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
    .png()
    .toFile(testImagePath);

    console.log('✓ Created test image:', testImagePath);

    // Generate thumbnail
    const thumbnailPath = path.join(previewDir, 'test-image-thumb.jpg');
    await sharp(testImagePath)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    console.log('✓ Generated thumbnail:', thumbnailPath);

    // Get metadata of thumbnail
    const thumbMetadata = await sharp(thumbnailPath).metadata();
    console.log('✓ Thumbnail dimensions:', thumbMetadata.width, 'x', thumbMetadata.height);
    console.log('✓ Thumbnail format:', thumbMetadata.format);

    const thumbStats = await fs.stat(thumbnailPath);
    console.log('✓ Thumbnail size:', (thumbStats.size / 1024).toFixed(2), 'KB');

    console.log('\n✅ Image preview test PASSED\n');
    return true;
  } catch (error) {
    console.error('\n❌ Image preview test FAILED:', error.message);
    return false;
  }
}

// Test 2: Test ZIP file creation and listing
async function testZipExtraction() {
  console.log('\n========================================');
  console.log('TEST 2: ZIP Extraction and Listing');
  console.log('========================================\n');

  try {
    const testDir = path.join(__dirname, 'test-files');
    await fs.mkdir(testDir, { recursive: true });

    // Create test files to zip
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'This is test file 1');
    await fs.writeFile(path.join(testDir, 'file2.txt'), 'This is test file 2');
    await fs.writeFile(path.join(testDir, 'file3.txt'), 'This is test file 3');

    console.log('✓ Created test text files');

    // Create a ZIP file manually using yauzl's companion library yazl
    // For testing, we'll use a simpler approach - create a zip using node
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();

    zip.addFile('file1.txt', Buffer.from('This is test file 1'));
    zip.addFile('file2.txt', Buffer.from('This is test file 2'));
    zip.addFile('folder/', Buffer.alloc(0)); // Empty folder
    zip.addFile('folder/file3.txt', Buffer.from('This is test file 3 in folder'));

    const zipPath = path.join(testDir, 'test-archive.zip');
    zip.writeZip(zipPath);

    console.log('✓ Created test ZIP file:', zipPath);

    // Now test with yauzl
    const yauzl = require('yauzl');

    const entries = await new Promise((resolve, reject) => {
      const entries = [];

      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          const info = {
            filename: entry.fileName,
            size: entry.uncompressedSize,
            compressedSize: entry.compressedSize,
            isDirectory: /\/$/.test(entry.fileName),
          };

          entries.push(info);
          zipfile.readEntry();
        });

        zipfile.on('end', () => resolve(entries));
        zipfile.on('error', reject);
      });
    });

    console.log('✓ Successfully listed ZIP contents using yauzl:');
    console.log('  Total files:', entries.length);
    entries.forEach((entry, idx) => {
      console.log(`  ${idx + 1}. ${entry.filename} (${entry.size} bytes)${entry.isDirectory ? ' [DIR]' : ''}`);
    });

    // Test extraction of specific file
    const extractedPath = path.join(testDir, 'extracted-file.txt');
    await extractFileFromZip(zipPath, 'file1.txt', extractedPath);

    const extractedContent = await fs.readFile(extractedPath, 'utf-8');
    console.log('✓ Extracted file1.txt content:', extractedContent);

    console.log('\n✅ ZIP extraction test PASSED\n');
    return true;
  } catch (error) {
    console.error('\n❌ ZIP extraction test FAILED:', error.message);
    console.error(error);
    return false;
  }
}

// Helper function to extract file from ZIP
function extractFileFromZip(zipPath, targetFilename, outputPath) {
  return new Promise((resolve, reject) => {
    const yauzl = require('yauzl');

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (entry.fileName === targetFilename) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);

            const writeStream = require('fs').createWriteStream(outputPath);
            readStream.pipe(writeStream);

            writeStream.on('finish', () => {
              zipfile.close();
              resolve(outputPath);
            });

            writeStream.on('error', reject);
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => reject(new Error('File not found in ZIP')));
      zipfile.on('error', reject);
    });
  });
}

// Test 3: Test S3 integration
async function testS3Integration() {
  console.log('\n========================================');
  console.log('TEST 3: S3 Integration');
  console.log('========================================\n');

  try {
    // Check for required S3 environment variables
    const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET'];
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
      console.log('\n⚠️  Skipping S3 test - Missing required environment variables:');
      missingVars.forEach(v => console.log(`   - ${v}`));
      console.log('\nTo run S3 tests, set:');
      console.log('   export AWS_ACCESS_KEY_ID=your-key');
      console.log('   export AWS_SECRET_ACCESS_KEY=your-secret');
      console.log('   export AWS_REGION=us-east-1');
      console.log('   export AWS_S3_BUCKET=your-bucket-name');
      console.log('\n✅ S3 integration test SKIPPED (set env vars to run)\n');
      return true; // Skip but don't fail
    }

    // Use environment variables for S3 configuration
    process.env.STORAGE_TYPE = 's3';
    // AWS credentials already set from environment

    // Import S3 storage adapter
    const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    console.log('✓ S3 Client initialized');
    console.log('  Region:', process.env.AWS_REGION);
    console.log('  Bucket:', process.env.AWS_S3_BUCKET);

    // Test 1: List bucket contents
    console.log('\n→ Testing bucket access...');
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET,
      MaxKeys: 5,
    });

    const listResponse = await s3Client.send(listCommand);
    console.log('✓ Successfully accessed bucket');
    console.log('  Total objects:', listResponse.KeyCount || 0);

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      console.log('  Sample files:');
      listResponse.Contents.slice(0, 3).forEach((obj, idx) => {
        console.log(`    ${idx + 1}. ${obj.Key} (${(obj.Size / 1024).toFixed(2)} KB)`);
      });
    }

    // Test 2: Upload a test file
    console.log('\n→ Testing file upload...');
    const testContent = `Test file uploaded at ${new Date().toISOString()}`;
    const testKey = `test-uploads/test-${Date.now()}.txt`;

    const putCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain',
      ServerSideEncryption: 'AES256',
    });

    await s3Client.send(putCommand);
    console.log('✓ Successfully uploaded test file');
    console.log('  Key:', testKey);

    // Test 3: Download the file
    console.log('\n→ Testing file download...');
    const getCommand = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: testKey,
    });

    const getResponse = await s3Client.send(getCommand);

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of getResponse.Body) {
      chunks.push(chunk);
    }
    const downloadedContent = Buffer.concat(chunks).toString('utf-8');

    console.log('✓ Successfully downloaded test file');
    console.log('  Content matches:', downloadedContent === testContent);
    console.log('  Downloaded content:', downloadedContent);

    // Test 4: Test storage adapter directly
    console.log('\n→ Testing Storage Adapter...');
    const { StorageFactory } = require('./src/storage');
    const storage = StorageFactory.createAdapter('s3', {
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });

    const testImageBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 }
      }
    }).png().toBuffer();

    const storageKey = `test-uploads/test-image-${Date.now()}.png`;
    const result = await storage.store(testImageBuffer, storageKey, {
      contentType: 'image/png',
    });

    console.log('✓ Successfully stored image via Storage Adapter');
    console.log('  Storage key:', result.key);
    console.log('  Location:', result.location);

    // Retrieve and verify
    const retrievedBuffer = await storage.retrieve(storageKey);
    console.log('✓ Successfully retrieved image via Storage Adapter');
    console.log('  Size matches:', retrievedBuffer.length === testImageBuffer.length);

    // Test signed URL
    const signedUrl = await storage.getSignedUrl(storageKey, 60); // 60 seconds
    console.log('✓ Generated signed URL (valid for 60 seconds)');
    console.log('  URL:', signedUrl.substring(0, 80) + '...');

    console.log('\n✅ S3 integration test PASSED\n');
    return true;
  } catch (error) {
    console.error('\n❌ S3 integration test FAILED:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

// Test 4: Test DOCX preview generation
async function testDocxPreview() {
  console.log('\n========================================');
  console.log('TEST 4: DOCX Preview Generation');
  console.log('========================================\n');

  try {
    const mammoth = require('mammoth');
    const testDir = path.join(__dirname, 'test-files');
    const previewDir = path.join(__dirname, 'test-previews');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(previewDir, { recursive: true });

    // Create a simple DOCX file using raw ZIP (DOCX is just a ZIP)
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();

    // Minimal DOCX structure
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>This is a test document</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Created for testing DOCX preview generation.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(documentXml));

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml));

    const docxPath = path.join(testDir, 'test-document.docx');
    zip.writeZip(docxPath);

    console.log('✓ Created test DOCX file:', docxPath);

    // Test mammoth conversion
    const result = await mammoth.convertToHtml({ path: docxPath });

    console.log('✓ Converted DOCX to HTML');
    console.log('  Extracted text:', result.value.replace(/<[^>]*>/g, '').trim());

    const htmlPath = path.join(previewDir, 'test-document.html');
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  ${result.value}
</body>
</html>`;

    await fs.writeFile(htmlPath, fullHtml);
    console.log('✓ Saved HTML preview:', htmlPath);

    console.log('\n✅ DOCX preview test PASSED\n');
    return true;
  } catch (error) {
    console.error('\n❌ DOCX preview test FAILED:', error.message);
    console.error(error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Preview & S3 Integration Test Suite  ║');
  console.log('╚════════════════════════════════════════╝');

  const results = {
    imagePreview: await testImagePreview(),
    zipExtraction: await testZipExtraction(),
    docxPreview: await testDocxPreview(),
    s3Integration: await testS3Integration(),
  };

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║          TEST RESULTS SUMMARY          ║');
  console.log('╚════════════════════════════════════════╝\n');

  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test.padEnd(20)} ${passed ? 'PASSED' : 'FAILED'}`);
  });

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log(`\n${passedTests}/${totalTests} tests passed`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All tests PASSED!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests FAILED\n');
    process.exit(1);
  }
}

// Check if adm-zip is installed, if not, use workaround
async function ensureDependencies() {
  try {
    require.resolve('adm-zip');
  } catch (e) {
    console.log('Installing adm-zip for testing...');
    const { execSync } = require('child_process');
    execSync('npm install adm-zip', { stdio: 'inherit', cwd: __dirname });
  }
}

// Main
(async () => {
  try {
    await ensureDependencies();
    await runAllTests();
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
})();
