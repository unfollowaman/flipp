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

test('text-to-pdf input precedence and state switching', async (t) => {
  const state = {
    toastMsg: null,
    toastType: null,
    generatedContent: null
  };

  const elements = {
    'text-pdf-raw-input': { value: '', listeners: {}, addEventListener(e, f) { this.listeners[e] = f; } },
    'text-pdf-file-input': { value: '', files: [], listeners: {}, click() {}, addEventListener(e, f) { this.listeners[e] = f; } },
    'text-pdf-use-file-btn': { listeners: {}, addEventListener(e, f) { this.listeners[e] = f; } },
    'text-pdf-file-info': { textContent: '' },
    'text-pdf-build-btn': { listeners: {}, addEventListener(e, f) { this.listeners[e] = f; } },
    'text-pdf-download-btn': { listeners: {}, addEventListener(e, f) { this.listeners[e] = f; } },
    'text-pdf-reset-btn': { listeners: {}, addEventListener(e, f) { this.listeners[e] = f; } },
    'text-pdf-preview-area': { classList: { add() {}, remove() {} } },
    'text-pdf-results': { classList: { add() {}, remove() {} } }
  };

  const mockDocument = {
    getElementById: (id) => elements[id],
    fonts: { load: async () => {}, ready: Promise.resolve() }
  };

  const evalCode = `
    const document = mockDocument;
    function showToast(m, t) { state.toastMsg = m; state.toastType = t; }
    ${src
      .replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '')
      .replace('outputBlob = await generatePdfFromText(content);', 'state.generatedContent = content; outputBlob = new Blob([content]);')}
  `;

  new Function('mockDocument', 'state', 'Blob', evalCode)(
    mockDocument,
    state,
    class Blob { constructor(c) { this.content = c; } }
  );

  const rawInput = elements['text-pdf-raw-input'];
  const fileInput = elements['text-pdf-file-input'];
  const buildBtn = elements['text-pdf-build-btn'];
  const fileInfo = elements['text-pdf-file-info'];

  await t.test('selecting a file clears previous raw text and uses uploaded file content', async () => {
    rawInput.value = 'Existing typed text';
    rawInput.listeners['input']();

    // Now select a file
    fileInput.files = [{
      name: 'notes.txt',
      text: async () => 'Uploaded file content'
    }];
    fileInput.listeners['change']();

    assert.strictEqual(rawInput.value, '');
    assert.strictEqual(fileInfo.textContent, 'Selected file: notes.txt');

    await buildBtn.listeners['click']();
    assert.strictEqual(state.generatedContent, 'Uploaded file content');
  });

  await t.test('typing in textarea clears previously selected file and uses typed text', async () => {
    // Select a file first
    fileInput.files = [{
      name: 'data.txt',
      text: async () => 'Old file text'
    }];
    fileInput.listeners['change']();

    assert.strictEqual(fileInfo.textContent, 'Selected file: data.txt');

    // Now user types in rawInput
    rawInput.value = 'Fresh typed text';
    rawInput.listeners['input']();

    assert.strictEqual(fileInfo.textContent, '');
    assert.strictEqual(fileInput.value, '');

    await buildBtn.listeners['click']();
    assert.strictEqual(state.generatedContent, 'Fresh typed text');
  });

  await t.test('shows error toast when both typed text and file are empty', async () => {
    rawInput.value = '   ';
    rawInput.listeners['input']();

    state.toastMsg = null;
    await buildBtn.listeners['click']();
    assert.strictEqual(state.toastMsg, 'Add raw text or upload a text file first.');
  });
});
