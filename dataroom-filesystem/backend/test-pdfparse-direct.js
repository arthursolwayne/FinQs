const pdfParse = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');

// Test pdf-parse directly
async function testPdfParse() {
  console.log('Testing pdf-parse library directly...\n');

  try {
    // Create a test with existing PDFs in the repo
    const testDir = path.join(__dirname, 'test-files');

    // List available PDFs
    const files = await fs.readdir(testDir);
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    console.log('Available PDF files:', pdfFiles);

    if (pdfFiles.length === 0) {
      console.log('No PDF files found to test');
      process.exit(0);
    }

    // Try to parse each PDF
    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(testDir, pdfFile);
      console.log(`\nTesting: ${pdfFile}`);
      console.log('─'.repeat(50));

      try {
        const buffer = await fs.readFile(pdfPath);
        const data = await pdfParse(buffer);

        console.log(`✓ Successfully parsed`);
        console.log(`  Pages: ${data.numpages}`);
        console.log(`  Text length: ${data.text.length} characters`);
        console.log(`  Has info: ${!!data.info}`);
        if (data.info) {
          const title = data.info.Title || 'N/A';
          const author = data.info.Author || 'N/A';
          console.log(`  Title: ${title}`);
          console.log(`  Author: ${author}`);
        }
        const preview = data.text.substring(0, 100);
        console.log(`  First 100 chars: ${preview}...`);
      } catch (error) {
        console.log(`✗ Failed to parse: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testPdfParse();
