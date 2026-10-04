const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Read the source file
const srcPath = path.join(__dirname, '../js/text-to-pdf.js');
const src = fs.readFileSync(srcPath, 'utf8');

// Extract the normalizeText function
const match = src.match(/function normalizeText\(text\) \{[\s\S]*?\n\}/);
if (!match) {
  throw new Error('Could not find normalizeText function in ' + srcPath);
}

// Create the function from the extracted string
const normalizeText = new Function('text', match[0] + '\nreturn normalizeText(text);');

test('normalizeText', async (t) => {
  await t.test('handles normal text', () => {
    assert.strictEqual(normalizeText('Hello World'), 'Hello World');
  });

  await t.test('replaces \\r\\n with \\n', () => {
    assert.strictEqual(normalizeText('Line1\r\nLine2'), 'Line1\nLine2');
  });

  await t.test('replaces \\r with \\n', () => {
    assert.strictEqual(normalizeText('Line1\rLine2'), 'Line1\nLine2');
  });

  await t.test('replaces tabs with 4 spaces', () => {
    assert.strictEqual(normalizeText('Col1\tCol2'), 'Col1    Col2');
  });

  await t.test('removes trailing whitespace from individual lines', () => {
    assert.strictEqual(normalizeText('Line1  \nLine2\t \nLine3'), 'Line1\nLine2\nLine3');
  });

  await t.test('trims leading and trailing whitespace from the entire string', () => {
    assert.strictEqual(normalizeText('  \n  Hello \n '), 'Hello');
  });

  await t.test('handles empty string', () => {
    assert.strictEqual(normalizeText(''), '');
  });

  await t.test('handles a complex combination', () => {
    const input = ' \r\n  First line  \r\n\tSecond line\t  \nThird line \r \n ';
    const expected = 'First line\n    Second line\nThird line';
    assert.strictEqual(normalizeText(input), expected);
  });

  await t.test('preserves leading whitespace (indentation) on non-first lines', () => {
    assert.strictEqual(normalizeText('first line\n  indented line\n    more indented'), 'first line\n  indented line\n    more indented');
  });

  await t.test('preserves multiple consecutive spaces between words', () => {
    assert.strictEqual(normalizeText('word1   word2'), 'word1   word2');
  });

  await t.test('preserves multiple consecutive empty lines', () => {
    assert.strictEqual(normalizeText('line1\n\n\nline2'), 'line1\n\n\nline2');
  });

  await t.test('lines containing only spaces/tabs become empty lines', () => {
    assert.strictEqual(normalizeText('line1\n  \t  \nline2'), 'line1\n\nline2');
  });

  await t.test('handles multiple consecutive tabs', () => {
    assert.strictEqual(normalizeText('col1\t\tcol2'), 'col1        col2');
  });
});

test('text-to-pdf HTML accessibility attributes', async (t) => {
  await t.test('textarea input has an aria-label', () => {
    const htmlPath = path.join(__dirname, '../tools/text-to-pdf/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const textareaMatch = html.match(/<textarea\s+id="text-pdf-raw-input"[\s\S]*?>/);
    assert.ok(textareaMatch, 'Found #text-pdf-raw-input textarea in HTML');
    assert.match(textareaMatch[0], /aria-label=["'][^"']+["']/, '#text-pdf-raw-input should have non-empty aria-label');
  });
});

test('generatePdfFromText streaming page logic', async (t) => {
  const funcMatch = src.match(/async function generatePdfFromText\(content\) \{[\s\S]*?\n\}/);
  assert.ok(funcMatch, 'Found generatePdfFromText in source');

  let addPageCount = 0;
  let addImageCalls = [];
  let setPageCalls = [];

  class MockJsPDF {
    constructor() {
      this.pagesCount = 1;
      this.internal = {
        pageSize: {
          getWidth: () => 595.28,
          getHeight: () => 841.89,
        },
      };
    }
    addPage() {
      addPageCount++;
      this.pagesCount++;
    }
    addImage(dataUrl, format, x, y, w, h) {
      addImageCalls.push({ dataUrl, format, x, y, w, h });
    }
    getNumberOfPages() {
      return this.pagesCount;
    }
    setFontSize() {}
    setTextColor() {}
    setPage(p) {
      setPageCalls.push(p);
    }
    text() {}
    output() {
      return new Uint8Array([1, 2, 3]);
    }
  }

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      scale: () => {},
      fillRect: () => {},
      fillText: () => {},
      measureText: (txt) => ({ width: txt.length * 6 }),
    }),
    toDataURL: (type, quality) => `data:${type};base64,mockdata`,
  };

  const mockDocument = {
    fonts: {
      load: async () => {},
      ready: Promise.resolve(),
    },
    createElement: (tag) => {
      if (tag === 'canvas') return mockCanvas;
      return {};
    },
    getElementById: () => null,
  };

  const fn = new Function(
    'window',
    'document',
    'HAS_NON_WHITESPACE_REGEX',
    `
    ${funcMatch[0]}
    return generatePdfFromText;
    `
  );

  const generatePdfFromText = fn(
    { jspdf: { jsPDF: MockJsPDF } },
    mockDocument,
    /\S/
  );

  await t.test('streams pages directly to jsPDF without buffering array', async () => {
    addPageCount = 0;
    addImageCalls = [];
    setPageCalls = [];

    const shortContent = 'Hello world\nThis is a short text.';
    const result = await generatePdfFromText(shortContent);

    assert.ok(result, 'Returned PDF result');
    assert.strictEqual(addImageCalls.length, 1, 'Called addImage once for single page');
    assert.strictEqual(addPageCount, 0, 'No extra addPage needed for 1-page doc');
    assert.strictEqual(setPageCalls.length, 1, 'Footer applied to page 1');
  });

  await t.test('handles multi-page text document with page breaks', async () => {
    addPageCount = 0;
    addImageCalls = [];
    setPageCalls = [];

    // Construct content long enough to trigger multiple page breaks
    const longContent = Array.from({ length: 150 }, (_, i) => `Paragraph line number ${i + 1} with extra words to fill page.`).join('\n');
    const result = await generatePdfFromText(longContent);

    assert.ok(result, 'Returned PDF result');
    assert.ok(addImageCalls.length > 1, 'Called addImage multiple times for multi-page document');
    assert.strictEqual(addPageCount, addImageCalls.length - 1, 'addPage called once per additional page');
  });
});
