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
src += '\nreturn { formatBytes };\n';

const mockDocument = {
  getElementById: () => ({
    addEventListener: () => {},
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    value: '',
    textContent: ''
  }),
  getElementsByName: () => [{ addEventListener: () => {} }],
  querySelector: () => ({ value: '' })
};

const mockWindow = {};
const mockInitDropZone = () => {};
const mockShowToast = () => {};

const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', src);

// Evaluate and get formatBytes
const { formatBytes } = wrapper(
  mockDocument,
  mockWindow,
  mockInitDropZone,
  mockShowToast,
  class Blob {},
  { createObjectURL: () => '', revokeObjectURL: () => '' }
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
