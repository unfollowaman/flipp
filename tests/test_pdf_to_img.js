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

describe('pdf-to-img format and resolution handling', () => {
  test('renderPageToCanvas supports png and jpg formats correctly', async () => {
    const code = fs.readFileSync('js/pdf-to-img.js', 'utf-8');
    const fnMatch = code.match(/async function renderPageToCanvas\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'renderPageToCanvas function found');

    let toDataUrlCalls = [];
    let fillRectCalled = false;

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => { fillRectCalled = true; },
      }),
      toDataURL: (mime, quality) => {
        toDataUrlCalls.push({ mime, quality });
        return `data:${mime};base64,mockdata`;
      },
    };

    const mockDocument = {
      createElement: (tag) => {
        if (tag === 'canvas') return mockCanvas;
        return {};
      },
    };

    const mockPage = {
      getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
      render: () => ({ promise: Promise.resolve() }),
    };

    const renderPageToCanvas = new Function('document', `
      ${fnMatch[0]}
      return renderPageToCanvas;
    `)(mockDocument);

    // Test PNG render
    const pngResult = await renderPageToCanvas(mockPage, 2, 'png');
    assert.strictEqual(pngResult.dataUrl, 'data:image/png;base64,mockdata');
    assert.strictEqual(toDataUrlCalls[0].mime, 'image/png');
    assert.strictEqual(toDataUrlCalls[0].quality, undefined);

    // Test JPG render
    const jpgResult = await renderPageToCanvas(mockPage, 1, 'jpg');
    assert.strictEqual(jpgResult.dataUrl, 'data:image/jpeg;base64,mockdata');
    assert.strictEqual(toDataUrlCalls[1].mime, 'image/jpeg');
    assert.strictEqual(toDataUrlCalls[1].quality, 0.85);
    assert.strictEqual(fillRectCalled, true, 'JPG canvas should fill white background');
  });

  test('generates correct file extensions for result cards and zip downloads', () => {
    const code = fs.readFileSync('js/pdf-to-img.js', 'utf-8');
    assert.ok(code.includes('const ext = imageFormat === "jpg" ? "jpg" : "png";'), 'Handles dynamic file extension');
    assert.ok(code.includes('`page-${String(pageNum).padStart(3, "0")}.${ext}`'), 'Uses dynamic extension for filenames');
  });
});
