#!/usr/bin/env node

/**
 * Quick functionality test after cleanup
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { generatePdfPreview, generateDocxPreview, generateImagePreview } = require('./src/services/previewService');

async function testPdfPreview() {
  console.log('\n=== Testing PDF Preview ===');

  try {
    // Create a simple test PDF using PDFKit
    const PDFDocument = require('pdfkit');
    const testPdfPath = './test-files/test.pdf';

    await fs.mkdir('./test-files', { recursive: true });

    // Create PDF
    const doc = new PDFDocument();
    const writeStream = require('fs').createWriteStream(testPdfPath);

    doc.pipe(writeStream);
    doc.fontSize(25).text('Test PDF Document', 100, 100);
    doc.fontSize(12).text('This is a test PDF for preview generation.', 100, 150);
    doc.end();

    // Wait for PDF to be written
    await new Promise((resolve) => writeStream.on('finish', resolve));

    console.log('✓ Test PDF created');

    // Generate preview
    const previewPath = await generatePdfPreview('test-pdf-id', testPdfPath, 'local');

    if (previewPath && await fs.access(previewPath).then(() => true).catch(() => false)) {
      const preview = await fs.readFile(previewPath, 'utf-8');
      console.log('✓ PDF preview generated successfully');
      console.log('✓ Preview contains HTML:', preview.includes('<!DOCTYPE html>'));
      console.log('✓ Preview contains metadata:', preview.includes('PDF Document Information'));
      console.log('✓ Preview path:', previewPath);
      return true;
    } else {
      console.log('✗ PDF preview generation failed');
      return false;
    }
  } catch (error) {
    console.log('✗ PDF preview test failed:', error.message);
    return false;
  }
}

async function testDocxPreview() {
  console.log('\n=== Testing DOCX Preview ===');

  try {
    const AdmZip = require('adm-zip');
    const testDocxPath = './test-files/test.docx';

    // Create a simple DOCX file
    const zip = new AdmZip();

    // Add basic DOCX structure
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const document = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Test DOCX Document</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>This is a test for DOCX preview generation.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    zip.addFile('[Content_Types].xml', Buffer.from(contentTypes));
    zip.addFile('_rels/.rels', Buffer.from(rels));
    zip.addFile('word/document.xml', Buffer.from(document));

    zip.writeZip(testDocxPath);
    console.log('✓ Test DOCX created');

    // Generate preview
    const previewPath = await generateDocxPreview('test-docx-id', testDocxPath, 'local');

    if (previewPath && await fs.access(previewPath).then(() => true).catch(() => false)) {
      const preview = await fs.readFile(previewPath, 'utf-8');
      console.log('✓ DOCX preview generated successfully');
      console.log('✓ Preview contains HTML:', preview.includes('<!DOCTYPE html>'));
      console.log('✓ Preview contains text:', preview.includes('Test DOCX Document'));
      console.log('✓ Preview path:', previewPath);
      return true;
    } else {
      console.log('✗ DOCX preview generation failed');
      return false;
    }
  } catch (error) {
    console.log('✗ DOCX preview test failed:', error.message);
    return false;
  }
}

async function testImagePreview() {
  console.log('\n=== Testing Image Preview ===');

  try {
    const testImagePath = './test-files/test.png';

    // Create a test image
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 0, g: 128, b: 255, alpha: 1 }
      }
    })
    .png()
    .toFile(testImagePath);

    console.log('✓ Test image created (800x600)');

    // Generate preview
    const previewPath = await generateImagePreview('test-image-id', testImagePath, 'local');

    if (previewPath && await fs.access(previewPath).then(() => true).catch(() => false)) {
      const metadata = await sharp(previewPath).metadata();
      console.log('✓ Image preview generated successfully');
      console.log('✓ Thumbnail dimensions:', metadata.width, 'x', metadata.height);
      console.log('✓ Format:', metadata.format);
      console.log('✓ Preview path:', previewPath);
      return true;
    } else {
      console.log('✗ Image preview generation failed');
      return false;
    }
  } catch (error) {
    console.log('✗ Image preview test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('FUNCTIONALITY TEST AFTER CLEANUP');
  console.log('========================================');

  const results = {
    pdf: await testPdfPreview(),
    docx: await testDocxPreview(),
    image: await testImagePreview()
  };

  console.log('\n========================================');
  console.log('TEST RESULTS');
  console.log('========================================');
  console.log('PDF Preview:   ', results.pdf ? '✓ PASS' : '✗ FAIL');
  console.log('DOCX Preview:  ', results.docx ? '✓ PASS' : '✗ FAIL');
  console.log('Image Preview: ', results.image ? '✓ PASS' : '✗ FAIL');

  const allPassed = Object.values(results).every(r => r);
  console.log('\nOverall Status:', allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED');
  console.log('========================================\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
