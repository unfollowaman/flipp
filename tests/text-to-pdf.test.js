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
});
