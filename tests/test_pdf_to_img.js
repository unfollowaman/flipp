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
