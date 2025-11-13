/**
 * Comprehensive DOCX Preview Generation Tests
 * Tests the generateDocxPreview function with various scenarios
 */

const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const { generateDocxPreview } = require('../../src/services/previewService');

describe('DOCX Preview Generation Service', () => {
  const testDir = path.join(__dirname, '../../test-files');
  const previewDir = path.join(__dirname, '../../uploads/previews');
  const fixturesDir = path.join(__dirname, '../fixtures');
  let testFileId = 'test-docx-' + Date.now();

  beforeAll(async () => {
    // Create directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(previewDir, { recursive: true });
    await fs.mkdir(fixturesDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      await fs.rm(previewDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  /**
   * Helper function to create a DOCX file with specified content
   */
  async function createDocxFile(filename, documentXml) {
    const zip = new AdmZip();

    // Add document.xml
    zip.addFile('word/document.xml', Buffer.from(documentXml));

    // Add [Content_Types].xml
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
    zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml));

    // Add .rels files
    const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
    zip.addFile('_rels/.rels', Buffer.from(rels));

    const docPath = path.join(testDir, filename);
    zip.writeZip(docPath);
    return docPath;
  }

  describe('Basic DOCX Preview Generation', () => {
    it('should generate HTML preview from simple DOCX file', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>This is a simple test document.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('simple.docx', documentXml);
      const fileId = 'simple-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');

      expect(previewPath).toBeDefined();
      expect(previewPath).not.toBeNull();

      // Verify the preview file was created
      const fileExists = (await fs.stat(previewPath)).isFile();
      expect(fileExists).toBe(true);

      // Read and verify content
      const htmlContent = await fs.readFile(previewPath, 'utf-8');
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('This is a simple test document.');
      expect(htmlContent).toContain('<body>');
      expect(htmlContent).toContain('</body>');
    });

    it('should handle multiple paragraphs in DOCX', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>First paragraph</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Second paragraph</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Third paragraph</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('multi-para.docx', documentXml);
      const fileId = 'multi-para-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      expect(htmlContent).toContain('First paragraph');
      expect(htmlContent).toContain('Second paragraph');
      expect(htmlContent).toContain('Third paragraph');

      // Should have 3 paragraph tags
      const pTags = (htmlContent.match(/<p>/g) || []).length;
      expect(pTags).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Formatted Text in DOCX', () => {
    it('should preserve bold text formatting', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t>Bold text</w:t>
      </w:r>
      <w:r>
        <w:t> and regular text</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('bold.docx', documentXml);
      const fileId = 'bold-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      expect(htmlContent).toContain('Bold text');
      expect(htmlContent).toContain('and regular text');
      // Mammoth should convert bold to <strong> tag
      expect(htmlContent).toContain('<strong>');
    });

    it('should preserve italic text formatting', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:i/>
        </w:rPr>
        <w:t>Italic text</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('italic.docx', documentXml);
      const fileId = 'italic-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      expect(htmlContent).toContain('Italic text');
      // Mammoth should convert italic to <em> tag
      expect(htmlContent).toContain('<em>');
    });

    it('should preserve headings', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
      </w:pPr>
      <w:r>
        <w:t>Main Heading</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading2"/>
      </w:pPr>
      <w:r>
        <w:t>Sub Heading</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Regular paragraph text</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('headings.docx', documentXml);
      const fileId = 'headings-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      expect(htmlContent).toContain('Main Heading');
      expect(htmlContent).toContain('Sub Heading');
      expect(htmlContent).toContain('Regular paragraph text');
      // Should have h1 and h2 tags
      expect(htmlContent).toMatch(/<h[12]>/);
    });
  });

  describe('HTML Output Quality', () => {
    it('should generate valid HTML structure', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Test content</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('valid-html.docx', documentXml);
      const fileId = 'valid-html-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      // Check for proper HTML structure
      expect(htmlContent).toMatch(/<!DOCTYPE html>/i);
      expect(htmlContent).toMatch(/<html[^>]*>/i);
      expect(htmlContent).toMatch(/<head[^>]*>/i);
      expect(htmlContent).toMatch(/<meta\s+charset="utf-8"/i);
      expect(htmlContent).toMatch(/<body[^>]*>/i);
      expect(htmlContent).toMatch(/<\/html>/i);
    });

    it('should include CSS styling', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Styled content</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('styled.docx', documentXml);
      const fileId = 'styled-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      // Check for CSS styles
      expect(htmlContent).toMatch(/<style[^>]*>/);
      expect(htmlContent).toContain('font-family');
      expect(htmlContent).toContain('padding');
      expect(htmlContent).toContain('max-width');
    });

    it('should handle image tags in preview', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Before image</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('with-images.docx', documentXml);
      const fileId = 'with-images-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      // Should contain CSS for image sizing
      expect(htmlContent).toMatch(/img\s*{\s*max-width/);
    });

    it('should handle table styling in CSS', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p>
            <w:r>
              <w:t>Cell 1</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('with-table.docx', documentXml);
      const fileId = 'with-table-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      // Should have table CSS styling
      expect(htmlContent).toContain('table');
      expect(htmlContent).toContain('border-collapse');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent file gracefully', async () => {
      const nonExistentPath = path.join(testDir, 'non-existent-file.docx');
      const fileId = 'nonexist-' + Date.now();

      const result = await generateDocxPreview(fileId, nonExistentPath, 'local');

      // Function should return null on error
      expect(result).toBeNull();
    });

    it('should handle invalid DOCX file', async () => {
      const invalidDocxPath = path.join(testDir, 'invalid.docx');
      await fs.writeFile(invalidDocxPath, 'This is not a valid DOCX file');

      const fileId = 'invalid-' + Date.now();
      const result = await generateDocxPreview(fileId, invalidDocxPath, 'local');

      // Function should return null on error
      expect(result).toBeNull();
    });

    it('should handle empty DOCX file', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('empty.docx', documentXml);
      const fileId = 'empty-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');

      // Should still create a preview for empty document
      expect(previewPath).toBeDefined();
      const htmlContent = await fs.readFile(previewPath, 'utf-8');
      expect(htmlContent).toContain('<!DOCTYPE html>');
    });
  });

  describe('File Path and Naming', () => {
    it('should generate correct preview filename', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Test</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('naming-test.docx', documentXml);
      const fileId = 'file-123-456-789';

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');

      expect(previewPath).toContain('file-123-456-789');
      expect(previewPath).toContain('_docx_preview.html');
    });

    it('should place preview in correct directory', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Directory test</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('dir-test.docx', documentXml);
      const fileId = 'dir-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');

      expect(previewPath).toContain('previews');
      expect(previewPath.startsWith(previewDir) || previewPath.includes('uploads/previews')).toBe(true);
    });
  });

  describe('Content Extraction', () => {
    it('should extract all text content correctly', async () => {
      const testText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${testText}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('content-test.docx', documentXml);
      const fileId = 'content-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      // Text should be preserved without HTML escaping issues
      expect(htmlContent).toContain(testText);
    });

    it('should handle special characters safely', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Text with &lt;brackets&gt; and &amp; ampersand</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('special-chars.docx', documentXml);
      const fileId = 'special-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      // Check that special characters are handled
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain('</html>');
    });

    it('should preserve line breaks and whitespace structure', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Line 1</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Line 2</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Line 3</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('lines.docx', documentXml);
      const fileId = 'lines-' + Date.now();

      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const htmlContent = await fs.readFile(previewPath, 'utf-8');

      // Each line should have its own paragraph
      expect(htmlContent).toContain('Line 1');
      expect(htmlContent).toContain('Line 2');
      expect(htmlContent).toContain('Line 3');
    });
  });

  describe('File Size and Performance', () => {
    it('should handle file size within reasonable limits', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Test content</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = await createDocxFile('size-test.docx', documentXml);
      const docxStat = await fs.stat(docxPath);

      // DOCX should be reasonably sized (not bloated)
      expect(docxStat.size).toBeLessThan(10000); // Less than 10KB for simple content

      const fileId = 'size-' + Date.now();
      const previewPath = await generateDocxPreview(fileId, docxPath, 'local');
      const previewStat = await fs.stat(previewPath);

      // Preview HTML should also be reasonable
      expect(previewStat.size).toBeLessThan(50000); // Less than 50KB
    });
  });
});
