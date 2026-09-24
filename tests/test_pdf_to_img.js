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

  test('renderPageToCanvas skips toDataURL when generateDataUrl is false', async () => {
    const code = fs.readFileSync('js/pdf-to-img.js', 'utf-8');
    const fnMatch = code.match(/async function renderPageToCanvas\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'renderPageToCanvas function found');

    let toDataUrlCalled = false;

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => {},
      }),
      toDataURL: () => {
        toDataUrlCalled = true;
        return 'data:image/png;base64,mockdata';
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

    const result = await renderPageToCanvas(mockPage, 0.3, 'png', false);
    assert.strictEqual(result.dataUrl, null);
    assert.strictEqual(result.canvas, mockCanvas);
    assert.strictEqual(toDataUrlCalled, false, 'toDataURL should not be called when generateDataUrl is false');
  });

  test('generates correct file extensions for result cards and zip downloads', () => {
    const code = fs.readFileSync('js/pdf-to-img.js', 'utf-8');
    assert.ok(code.includes('const ext = imageFormat === "jpg" ? "jpg" : "png";'), 'Handles dynamic file extension');
    assert.ok(code.includes('`page-${String(pageNum).padStart(3, "0")}.${ext}`'), 'Uses dynamic extension for filenames');
  });
});

describe('loadPDF error handling and validation', () => {
  function extractFunctionByBraceMatching(sourceCode, signature) {
    const startIdx = sourceCode.indexOf(signature);
    if (startIdx === -1) throw new Error(`Signature "${signature}" not found`);
    const braceStart = sourceCode.indexOf('{', startIdx);
    if (braceStart === -1) throw new Error(`Opening brace not found after "${signature}"`);

    let depth = 0;
    for (let i = braceStart; i < sourceCode.length; i++) {
      if (sourceCode[i] === '{') depth++;
      else if (sourceCode[i] === '}') {
        depth--;
        if (depth === 0) {
          return sourceCode.slice(startIdx, i + 1);
        }
      }
    }
    throw new Error(`Unmatched braces for "${signature}"`);
  }

  function createLoadPDFContext(options = {}) {
    const code = fs.readFileSync('js/pdf-to-img.js', 'utf-8');
    const getPdfjsLibCode = extractFunctionByBraceMatching(code, 'function getPdfjsLib()');
    const waitForPdfjsCode = extractFunctionByBraceMatching(code, 'async function waitForPdfjs()');
    const loadPDFCode = extractFunctionByBraceMatching(code, 'async function loadPDF(file)');

    let toastMsg = null;
    let toastType = null;
    const mockShowToast = (msg, type) => {
      toastMsg = msg;
      toastType = type;
    };

    const mockShowPreview = options.showPreview || (() => {});
    const mockSetProgress = options.setProgress || (() => {});
    const mockResetTool = options.resetTool || (() => {});
    const mockWindow = options.window || {};

    const loadPDF = new Function(
      'window',
      'showToast',
      'showPreview',
      'setProgress',
      'resetTool',
      'progressBar',
      'progressLabel',
      'initialPdfDoc',
      `
      let pdfDoc = initialPdfDoc || null;
      let totalPages = 0;
      ${getPdfjsLibCode}
      ${waitForPdfjsCode}
      ${loadPDFCode}
      return loadPDF;
    `
    )(
      mockWindow,
      mockShowToast,
      mockShowPreview,
      mockSetProgress,
      mockResetTool,
      {},
      {},
      options.initialPdfDoc || null
    );

    return {
      loadPDF,
      getToastMsg: () => toastMsg,
      getToastType: () => toastType,
    };
  }

  test('shows error toast when non-PDF file is supplied', async () => {
    const ctx = createLoadPDFContext();
    await ctx.loadPDF({ name: 'notes.txt', type: 'text/plain' });
    assert.strictEqual(ctx.getToastMsg(), 'Please upload a PDF file.');
    assert.strictEqual(ctx.getToastType(), 'error');
  });

  test('handles getDocument rejection when loading empty/corrupted PDF', async () => {
    const mockWindow = {
      'pdfjs-dist/build/pdf': {
        GlobalWorkerOptions: {},
        getDocument: () => ({
          promise: Promise.reject(new Error('Invalid or corrupted PDF')),
        }),
      },
    };

    const ctx = createLoadPDFContext({ window: mockWindow });
    const emptyFile = {
      name: 'corrupted.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(0),
    };

    await ctx.loadPDF(emptyFile);
    assert.strictEqual(
      ctx.getToastMsg(),
      'Failed to load PDF. Is it a valid, non-encrypted file?'
    );
    assert.strictEqual(ctx.getToastType(), 'error');
  });

  test('destroys existing pdfDoc on reload and catches destroy errors', async () => {
    let destroyCalled = false;
    const mockWindow = {
      'pdfjs-dist/build/pdf': {
        GlobalWorkerOptions: {},
        getDocument: () => ({
          promise: Promise.reject(new Error('Load failed')),
        }),
      },
    };

    const ctx = createLoadPDFContext({
      window: mockWindow,
      initialPdfDoc: {
        destroy: async () => {
          destroyCalled = true;
          throw new Error('Destroy error');
        },
      },
    });

    await ctx.loadPDF({
      name: 'test.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(8),
    });

    assert.strictEqual(destroyCalled, true, 'destroy should be called on existing pdfDoc');
    assert.strictEqual(
      ctx.getToastMsg(),
      'Failed to load PDF. Is it a valid, non-encrypted file?'
    );
  });
});
