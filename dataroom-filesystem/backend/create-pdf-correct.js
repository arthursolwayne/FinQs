// Create a proper PDF using a different approach
const fs = require('fs');
const path = require('path');

// Use the pdf library directly
try {
  const PDFDocument = require('pdfkit');
  const testDir = path.join(__dirname, 'test-files');
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const pdfPath = path.join(testDir, 'proper-document.pdf');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
  });

  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  // Add content
  doc.font('Helvetica')
    .fontSize(24)
    .text('Test PDF Document', 100, 100);

  doc.fontSize(12)
    .text('Created for PDF Preview Testing', 100, 150);

  doc.fontSize(11)
    .text('', 100, 200)
    .text('This is a test PDF document that will be used to verify', 100, 220, { width: 400 })
    .text('the PDF preview generation functionality of the dataroom application.', 100, 240, { width: 400 })
    .text('', 100, 270)
    .text('Key Features:', 100, 290)
    .text('• Text extraction from PDF files', 100, 310, { indent: 20 })
    .text('• Metadata preservation', 100, 330, { indent: 20 })
    .text('• HTML preview output', 100, 350, { indent: 20 })
    .text('• Proper error handling', 100, 370, { indent: 20 });

  // Add a second page
  doc.addPage()
    .fontSize(16)
    .text('Page 2: Additional Content', 100, 100);

  doc.fontSize(11)
    .text('This is page two of the test document.', 100, 150)
    .text('It demonstrates multi-page PDF support.', 100, 170);

  doc.end();

  stream.on('finish', () => {
    console.log('✓ PDF created successfully:', pdfPath);
    const stats = fs.statSync(pdfPath);
    console.log('✓ File size:', stats.size, 'bytes');
    process.exit(0);
  });

  stream.on('error', (err) => {
    console.error('✗ Error creating PDF:', err);
    process.exit(1);
  });
} catch (error) {
  console.error('✗ Error:', error.message);
  process.exit(1);
}
