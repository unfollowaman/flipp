const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-compress.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
// Strip export keywords
src = src.replace(/export\s+function/g, 'function');

// To extract formatBytes function we can append a return statement
src += '\nreturn { formatBytes, createDownloadButton, updateProgress };\n';

const elementMap = {};

const mockDocument = {
  getElementById: (id) => {
    if (!elementMap[id]) {
      elementMap[id] = {
        addEventListener: () => {},
        style: {},
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        value: '',
        textContent: ''
      };
    }
    return elementMap[id];
  },
  getElementsByName: () => [{ addEventListener: () => {} }],
  querySelector: () => ({ value: '' }),
  createElement: (tagName) => ({
    tagName,
    style: {},
    addEventListener: () => {},
    appendChild: function(child) {
      if (!this.children) this.children = [];
      this.children.push(child);
    }
  }),
  createTextNode: (text) => ({ textNode: true, textContent: text })
};

const mockWindow = {};
const mockInitDropZone = () => {};
const mockShowToast = () => {};

const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', src);

// Evaluate and get functions
const { formatBytes, createDownloadButton, updateProgress } = wrapper(
  mockDocument,
  mockWindow,
  mockInitDropZone,
  mockShowToast,
  class Blob {},
  { createObjectURL: () => 'blob:mock-url', revokeObjectURL: () => '' }
);

test('formatBytes function', async (t) => {
  await t.test('handles 0 bytes', () => {
    assert.strictEqual(formatBytes(0), '0 Bytes');
  });

  await t.test('handles bytes under 1 KB', () => {
    assert.strictEqual(formatBytes(500), '500 Bytes');
    assert.strictEqual(formatBytes(1023), '1023 Bytes');
  });

  await t.test('handles KB', () => {
    assert.strictEqual(formatBytes(1024), '1 KB');
    assert.strictEqual(formatBytes(1536), '1.5 KB'); // 1.5 * 1024
  });

  await t.test('handles MB', () => {
    assert.strictEqual(formatBytes(1048576), '1 MB'); // 1024 * 1024
    assert.strictEqual(formatBytes(1572864), '1.5 MB'); // 1.5 * 1024 * 1024
  });

  await t.test('handles GB', () => {
    assert.strictEqual(formatBytes(1073741824), '1 GB'); // 1024^3
  });

  await t.test('handles TB', () => {
    assert.strictEqual(formatBytes(1099511627776), '1 TB'); // 1024^4
  });

  await t.test('respects decimals parameter', () => {
    assert.strictEqual(formatBytes(1536, 0), '2 KB'); // 1.5 rounds to 2 with 0 decimals
    assert.strictEqual(formatBytes(1536, 1), '1.5 KB');
    assert.strictEqual(formatBytes(1536, 3), '1.5 KB'); // parseFloat removes trailing zeros
  });

  await t.test('handles negative decimals as 0', () => {
    assert.strictEqual(formatBytes(1536, -1), '2 KB');
  });
});

test('createDownloadButton function', async (t) => {
  await t.test('creates download button with correct properties', () => {
    const mockBlob = new Blob(['mock content']);
    const filename = 'test-file.pdf';
    const label = 'test-file.pdf';

    const btn = createDownloadButton(mockBlob, filename, label);

    assert.strictEqual(btn.tagName, 'a');
    assert.strictEqual(btn.href, 'blob:mock-url');
    assert.strictEqual(btn.download, filename);
    assert.strictEqual(btn.className, 'cta-btn cta-mint');

    assert.strictEqual(btn.children.length, 2);

    const icon = btn.children[0];
    assert.strictEqual(icon.tagName, 'img');
    assert.strictEqual(icon.src, '/assets/icons/download--v2.png');
    assert.strictEqual(icon.alt, 'download');
    assert.strictEqual(icon.width, 16);
    assert.strictEqual(icon.height, 16);
    assert.strictEqual(icon.style.verticalAlign, 'middle');
    assert.strictEqual(icon.style.marginRight, '4px');

    const textNode = btn.children[1];
    assert.strictEqual(textNode.textNode, true);
    assert.strictEqual(textNode.textContent, ' Download test-file.pdf');
  });
});

test('updateProgress function', async (t) => {
  await t.test('updates the text content of progressText', () => {
    const progressTextElement = elementMap['compress-progress-text'];
    progressTextElement.textContent = ''; // Reset before test

    updateProgress('Compressing...');

    assert.strictEqual(progressTextElement.textContent, 'Compressing...');
  });
});
