const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Read the vanilla JS file and extract the function as a string
const code = fs.readFileSync('js/pdf-to-img.js', 'utf-8');
const match = code.match(/function parsePageRange\([\s\S]*?return \[\.\.\.pages\]\.sort\(\(a, b\) => a - b\);\n}/);

if (!match) {
  throw new Error("Function not found");
}

// Evaluate the function in the current scope
const parsePageRange = new Function(`
  ${match[0]}
  return parsePageRange;
`)();

describe('parsePageRange', () => {
  test('handles large ranges bounded by total pages', () => {
    const result = parsePageRange('1-10000', 10);
    assert.deepStrictEqual(result, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('handles exact boundaries', () => {
    const result = parsePageRange('1-5', 5);
    assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
  });

  test('handles inverted ranges', () => {
    const result = parsePageRange('5-1', 10);
    assert.deepStrictEqual(result, []);
  });

  test('handles mixed ranges with overlaps and large numbers', () => {
    const result = parsePageRange('1-3, 2-10000', 5);
    assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
  });

  test('handles single large numbers beyond total', () => {
    const result = parsePageRange('10000', 5);
    assert.deepStrictEqual(result, []);
  });

  test('handles single large numbers beyond total correctly', () => {
    const result = parsePageRange('100', 10);
    assert.deepStrictEqual(result, []);
  });

  test('handles multiple parts including valid and invalid values', () => {
    const result = parsePageRange('1, 15, 3-4', 10);
    assert.deepStrictEqual(result, [1, 3, 4]);
  });

  test('handles empty input string', () => {
    const result = parsePageRange('', 10);
    assert.deepStrictEqual(result, []);
  });

  test('handles gibberish string', () => {
    const result = parsePageRange('abc, d-e', 10);
    assert.deepStrictEqual(result, []);
  });
});

describe('pdf-to-img resource cleanup', () => {
  test('ensures page.cleanup is invoked in try...finally blocks', () => {
    const code = fs.readFileSync('js/pdf-to-img.js', 'utf-8');
    const cleanupCount = (code.match(/page\.cleanup\(\)/g) || []).length;
    assert.ok(cleanupCount >= 2, 'page.cleanup() should be called in page processing loops');
  });

  test('ensures pdfDoc.destroy is invoked during reset and reload', () => {
    const code = fs.readFileSync('js/pdf-to-img.js', 'utf-8');
    const destroyCount = (code.match(/pdfDoc\.destroy\(\)/g) || []).length;
    assert.ok(destroyCount >= 2, 'pdfDoc.destroy() should be called when resetting or reloading PDF');
  });
});
