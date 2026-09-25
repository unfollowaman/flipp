const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/add-watermark.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements and export keywords
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
src = src.replace(/export\s+function/g, 'function');
src = src.replace(/export\s+const/g, 'const');

// Expose functions for testing
src += '\nreturn { getPdfPositionOffset, getPdfCoordinates, getPageConfig, applyWatermarkScope, applyWatermarkPattern, drawWatermarkOnCanvas, renderPagePreview, handleFile, resetApp, getPageConfigs: () => pageConfigs, setPageConfig: (p, c) => { pageConfigs[p] = c; }, getGlobalWatermarkConfig: () => globalWatermarkConfig };\n';

function createMockDocument() {
  const elements = {};
  const createMockElement = (id = '') => {
    if (id && elements[id]) return elements[id];
    const el = {
      id,
      value: id === 'wm-font-size' ? '48' : id === 'wm-scale' ? '1.0' : id === 'wm-opacity' ? '50' : id === 'wm-rotation' ? '45' : id === 'wm-position' ? 'center' : id === 'wm-text-input' ? 'CONFIDENTIAL' : id === 'wm-color' ? '#000000' : '',
      style: { display: '' },
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      appendChild: () => {},
      innerHTML: '',
      textContent: '',
      addEventListener: () => {},
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      getAttribute: () => null,
      setAttribute: () => {},
      removeAttribute: () => {},
      getContext: () => ({
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        fillText: () => {},
        drawImage: () => {},
        measureText: () => ({ width: 100 }),
        strokeRect: () => {},
        fillRect: () => {},
        clearRect: () => {},
        setLineDash: () => {},
      })
    };
    if (id) elements[id] = el;
    return el;
  };

  return {
    getElementById: createMockElement,
    createElement: () => createMockElement(),
    querySelectorAll: () => []
  };
}

test('getPdfPositionOffset functionality', async (t) => {
  const mockDocument = createMockDocument();
  const mockWindow = {};
  const mockInitDropZone = () => {};
  const mockShowToast = () => {};
  const mockSetProgress = () => {};
  const mockActivatePill = () => {};

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'setProgress', 'activatePill', 'Blob', 'URL', src);
  const { getPdfPositionOffset } = wrapper(mockDocument, mockWindow, mockInitDropZone, mockShowToast, mockSetProgress, mockActivatePill, class Blob {}, { createObjectURL: () => '', revokeObjectURL: () => '' });

  await t.test('calculates correct offset for 0 degree rotation', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = 0;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    assert.strictEqual(Math.round(result.dx), 75);
    assert.strictEqual(Math.round(result.dy), 75);
  });

  await t.test('calculates correct offset for 90 degree rotation', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = 90;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    assert.strictEqual(Math.round(result.dx), 75);
    assert.strictEqual(Math.round(result.dy), 125);
  });

  await t.test('calculates correct offset for 180 degree rotation', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = 180;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    assert.strictEqual(Math.round(result.dx), 125);
    assert.strictEqual(Math.round(result.dy), 125);
  });

  await t.test('calculates correct offset for 270 degree rotation', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = 270;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    assert.strictEqual(Math.round(result.dx), 125);
    assert.strictEqual(Math.round(result.dy), 75);
  });

  await t.test('handles non-square items and origin (0,0)', () => {
    const cx = 0, cy = 0, w = 100, h = 50, rot = 45;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);

    const rad = -45 * (Math.PI / 180);
    const expectedDx = -50 * Math.cos(rad) - (-25 * Math.sin(rad));
    const expectedDy = -50 * Math.sin(rad) + (-25 * Math.cos(rad));

    assert.strictEqual(result.dx, expectedDx);
    assert.strictEqual(result.dy, expectedDy);
  });

  await t.test('handles negative rotation angles', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = -90;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    assert.strictEqual(Math.round(result.dx), 125);
    assert.strictEqual(Math.round(result.dy), 75);
  });
});

test('getPdfCoordinates functionality', async (t) => {
  const mockDocument = createMockDocument();
  const mockWindow = {};
  const mockInitDropZone = () => {};
  const mockShowToast = () => {};
  const mockSetProgress = () => {};
  const mockActivatePill = () => {};

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'setProgress', 'activatePill', 'Blob', 'URL', src);
  const { getPdfCoordinates } = wrapper(mockDocument, mockWindow, mockInitDropZone, mockShowToast, mockSetProgress, mockActivatePill, class Blob {}, { createObjectURL: () => '', revokeObjectURL: () => '' });

  await t.test('calculates correct coordinates for center position', () => {
    const result = getPdfCoordinates('center', 1000, 1000, 100, 50);
    assert.deepStrictEqual(result, { x: 500, y: 500 });
  });

  await t.test('calculates correct coordinates for top-left position', () => {
    const result = getPdfCoordinates('top-left', 1000, 1000, 100, 50);
    assert.deepStrictEqual(result, { x: 20 + 50, y: 1000 - 20 - 25 });
  });

  await t.test('calculates correct coordinates for top-right position', () => {
    const result = getPdfCoordinates('top-right', 1000, 1000, 100, 50);
    assert.deepStrictEqual(result, { x: 1000 - 20 - 50, y: 1000 - 20 - 25 });
  });

  await t.test('calculates correct coordinates for bottom-left position', () => {
    const result = getPdfCoordinates('bottom-left', 1000, 1000, 100, 50);
    assert.deepStrictEqual(result, { x: 20 + 50, y: 20 + 25 });
  });

  await t.test('calculates correct coordinates for bottom-right position', () => {
    const result = getPdfCoordinates('bottom-right', 1000, 1000, 100, 50);
    assert.deepStrictEqual(result, { x: 1000 - 20 - 50, y: 20 + 25 });
  });

  await t.test('returns (0, 0) for unrecognized position', () => {
    const result = getPdfCoordinates('unknown', 1000, 1000, 100, 50);
    assert.deepStrictEqual(result, { x: 0, y: 0 });
  });
});

test('getPageConfig and applyWatermarkScope functionality', async (t) => {
  const mockDocument = createMockDocument();
  const mockWindow = {};
  const mockInitDropZone = () => {};
  let toastMessage = '';
  const mockShowToast = (msg) => { toastMessage = msg; };
  const mockSetProgress = () => {};
  const mockActivatePill = () => {};

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'setProgress', 'activatePill', 'Blob', 'URL', src);
  const { getPageConfig, applyWatermarkScope, setPageConfig, getPageConfigs, getGlobalWatermarkConfig } = wrapper(mockDocument, mockWindow, mockInitDropZone, mockShowToast, mockSetProgress, mockActivatePill, class Blob {}, { createObjectURL: () => '', revokeObjectURL: () => '' });

  await t.test('returns default page config', () => {
    const config = getPageConfig(1);
    assert.strictEqual(config.position, 'center');
    assert.strictEqual(config.fontSize, 48);
    assert.strictEqual(config.scale, 1);
  });

  await t.test('applies scope to single page only', () => {
    setPageConfig(2, { fontSize: 32, scale: 0.8 });
    applyWatermarkScope('page', 2);

    assert.strictEqual(toastMessage, 'Applied change to page 2 only');
    assert.deepStrictEqual(getPageConfigs()[2], { fontSize: 32, scale: 0.8 });

    const page1Config = getPageConfig(1);
    const page2Config = getPageConfig(2);
    assert.strictEqual(page1Config.fontSize, 48);
    assert.strictEqual(page2Config.fontSize, 32);
    assert.strictEqual(page2Config.scale, 0.8);
  });

  await t.test('propagates full page overrides to all pages when scope is all', () => {
    setPageConfig(2, {
      position: 'custom',
      customX: 0.35,
      customY: 0.65,
      fontSize: 64,
      scale: 2.5
    });

    applyWatermarkScope('all', 2);

    assert.strictEqual(toastMessage, 'Applied change to all pages');

    const globalConfig = getGlobalWatermarkConfig();
    assert.strictEqual(globalConfig.position, 'custom');
    assert.strictEqual(globalConfig.customX, 0.35);
    assert.strictEqual(globalConfig.customY, 0.65);

    const fontSizeInputEl = mockDocument.getElementById('wm-font-size');
    const fontSizeValEl = mockDocument.getElementById('wm-font-size-val');
    const scaleInputEl = mockDocument.getElementById('wm-scale');
    const scaleValEl = mockDocument.getElementById('wm-scale-val');

    assert.strictEqual(fontSizeInputEl.value, 64);
    assert.strictEqual(fontSizeValEl.textContent, 64);
    assert.strictEqual(scaleInputEl.value, 2.5);
    assert.strictEqual(scaleValEl.textContent, '2.5');

    assert.deepStrictEqual(getPageConfigs(), {});

    const page1Config = getPageConfig(1);
    const page2Config = getPageConfig(2);
    const page3Config = getPageConfig(3);

    assert.strictEqual(page1Config.fontSize, 64);
    assert.strictEqual(page1Config.scale, 2.5);
    assert.strictEqual(page1Config.position, 'custom');
    assert.strictEqual(page1Config.customX, 0.35);
    assert.strictEqual(page1Config.customY, 0.65);

    assert.strictEqual(page2Config.fontSize, 64);
    assert.strictEqual(page3Config.fontSize, 64);
  });

  await t.test('handles partial page config overrides when applying scope to all', () => {
    setPageConfig(3, { fontSize: 72 });

    applyWatermarkScope('all', 3);

    assert.strictEqual(toastMessage, 'Applied change to all pages');

    const fontSizeInputEl = mockDocument.getElementById('wm-font-size');
    const fontSizeValEl = mockDocument.getElementById('wm-font-size-val');

    assert.strictEqual(fontSizeInputEl.value, 72);
    assert.strictEqual(fontSizeValEl.textContent, 72);

    assert.deepStrictEqual(getPageConfigs(), {});

    assert.strictEqual(getPageConfig(1).fontSize, 72);
    assert.strictEqual(getPageConfig(3).fontSize, 72);
  });

  await t.test('handles non-existent target page config gracefully when applying scope to all', () => {
    applyWatermarkScope('all', 99);

    assert.strictEqual(toastMessage, 'Applied change to all pages');
    assert.deepStrictEqual(getPageConfigs(), {});
  });
});

test('applyWatermarkPattern functionality', async (t) => {
  const mockDocument = createMockDocument();
  const mockWindow = {};
  const mockInitDropZone = () => {};
  const mockShowToast = () => {};
  const mockSetProgress = () => {};
  const mockActivatePill = () => {};

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'setProgress', 'activatePill', 'Blob', 'URL', src);
  const { applyWatermarkPattern } = wrapper(mockDocument, mockWindow, mockInitDropZone, mockShowToast, mockSetProgress, mockActivatePill, class Blob {}, { createObjectURL: () => '', revokeObjectURL: () => '' });

  await t.test('calls getCoordsFn and drawFn for single position', () => {
    let coordsCalled = false;
    let drawCoords = null;

    const getCoordsFn = (pos, w, h, iw, ih) => {
      coordsCalled = true;
      return { x: 100, y: 200 };
    };

    const drawFn = (x, y) => {
      drawCoords = { x, y };
    };

    applyWatermarkPattern('center', 800, 600, 50, 50, 20, 20, getCoordsFn, drawFn);

    assert.strictEqual(coordsCalled, true);
    assert.deepStrictEqual(drawCoords, { x: 100, y: 200 });
  });

  await t.test('tiles watermark efficiently across canvas', () => {
    const drawnPoints = [];
    const drawFn = (x, y) => {
      drawnPoints.push({ x, y });
    };

    const width = 800;
    const height = 600;
    const itemW = 100;
    const itemH = 50;
    const padX = 100;
    const padY = 100;

    applyWatermarkPattern('tile', width, height, itemW, itemH, padX, padY, null, drawFn);

    // Verify drawn points are generated
    assert.ok(drawnPoints.length > 0);

    // Check that drawn points include canvas area [0, 800] x [0, 600]
    const hasCanvasCover = drawnPoints.some(p => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
    assert.strictEqual(hasCanvasCover, true);

    // Verify iteration count is bounded significantly better than naive [-width, width*2]
    // 800x600 with step 200x150 should be around ~56 calls (vs 144 in old code)
    assert.ok(drawnPoints.length < 100, `Expected call count < 100, got ${drawnPoints.length}`);
  });
});

test('drawWatermarkOnCanvas functionality', async (t) => {
  const mockDocument = createMockDocument();
  const mockWindow = {};
  const mockInitDropZone = () => {};
  const mockShowToast = () => {};
  const mockSetProgress = () => {};
  const mockActivatePill = () => {};

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'setProgress', 'activatePill', 'Blob', 'URL', src);
  const { drawWatermarkOnCanvas } = wrapper(mockDocument, mockWindow, mockInitDropZone, mockShowToast, mockSetProgress, mockActivatePill, class Blob {}, { createObjectURL: () => '', revokeObjectURL: () => '' });

  await t.test('renders text watermark on canvas with context operations', () => {
    let saved = false;
    let restored = false;
    let filledText = null;
    let globalAlphaSet = null;

    const mockCtx = {
      save: () => { saved = true; },
      restore: () => { restored = true; },
      translate: () => {},
      rotate: () => {},
      fillText: (text, x, y) => { filledText = text; },
      measureText: () => ({ width: 120 }),
      strokeRect: () => {},
      fillRect: () => {},
      setLineDash: () => {},
      font: '',
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      get globalAlpha() { return globalAlphaSet; },
      set globalAlpha(v) { globalAlphaSet = v; }
    };

    const config = {
      mode: 'text',
      text: 'CONFIDENTIAL',
      fontSize: 24,
      color: '#ff0000',
      opacity: 0.8,
      rotation: 45,
      position: 'center',
      customX: null,
      customY: null
    };

    drawWatermarkOnCanvas(mockCtx, 800, 600, config);

    assert.strictEqual(saved, true);
    assert.strictEqual(restored, true);
    assert.strictEqual(globalAlphaSet, 0.8);
    assert.strictEqual(filledText, 'CONFIDENTIAL');
  });

  await t.test('handles empty text watermark gracefully without drawing text', () => {
    let filledText = null;
    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      fillText: (text, x, y) => { filledText = text; },
      measureText: () => ({ width: 0 }),
      strokeRect: () => {},
      fillRect: () => {},
      setLineDash: () => {},
      get globalAlpha() { return 1; },
      set globalAlpha(v) {}
    };

    const config = {
      mode: 'text',
      text: '',
      fontSize: 24,
      color: '#ff0000',
      opacity: 1,
      rotation: 0,
      position: 'center'
    };

    drawWatermarkOnCanvas(mockCtx, 800, 600, config);

    assert.strictEqual(filledText, null);
  });

  await t.test('renders tiled text watermark', () => {
    let fillTextCount = 0;
    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      fillText: () => { fillTextCount++; },
      measureText: () => ({ width: 100 }),
      strokeRect: () => {},
      fillRect: () => {},
      setLineDash: () => {},
      get globalAlpha() { return 1; },
      set globalAlpha(v) {}
    };

    const config = {
      mode: 'text',
      text: 'SAMPLE',
      fontSize: 20,
      color: '#000000',
      opacity: 0.5,
      rotation: 30,
      position: 'tile'
    };

    drawWatermarkOnCanvas(mockCtx, 800, 600, config);

    assert.ok(fillTextCount > 1, `Expected multiple fillText calls for tile mode, got ${fillTextCount}`);
  });

  await t.test('renders custom position watermark', () => {
    let translateCoords = [];
    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: (x, y) => { translateCoords.push({ x, y }); },
      rotate: () => {},
      fillText: () => {},
      measureText: () => ({ width: 100 }),
      strokeRect: () => {},
      fillRect: () => {},
      setLineDash: () => {},
      get globalAlpha() { return 1; },
      set globalAlpha(v) {}
    };

    const config = {
      mode: 'text',
      text: 'CUSTOM',
      fontSize: 20,
      color: '#000000',
      opacity: 1,
      rotation: 0,
      position: 'custom',
      customX: 0.25,
      customY: 0.75
    };

    drawWatermarkOnCanvas(mockCtx, 800, 600, config);

    // customX: 0.25 * 800 = 200, customY: 0.75 * 600 = 450
    const textTranslate = translateCoords.find(c => c.x === 200 && c.y === 450);
    assert.ok(textTranslate, 'Expected text to translate to custom coordinates (200, 450)');
  });
});

test('add-watermark resource cleanup', async (t) => {
  const mockDocument = createMockDocument();
  let cleanupCalled = false;
  let destroyCount = 0;

  const mockPage = {
    getViewport: () => ({ width: 800, height: 600 }),
    render: () => ({ promise: Promise.resolve() }),
    cleanup: () => { cleanupCalled = true; },
  };

  const mockPdfDoc = {
    numPages: 5,
    getPage: async () => mockPage,
    destroy: async () => { destroyCount++; },
  };

  const mockWindow = {
    'pdfjs-dist/build/pdf': {
      getDocument: () => ({
        promise: Promise.resolve(mockPdfDoc),
      }),
    },
  };

  const mockInitDropZone = () => {};
  const mockShowToast = () => {};
  const mockSetProgress = () => {};
  const mockActivatePill = () => {};

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'setProgress', 'activatePill', 'Blob', 'URL', src);
  const exports = wrapper(mockDocument, mockWindow, mockInitDropZone, mockShowToast, mockSetProgress, mockActivatePill, class Blob {}, { createObjectURL: () => '', revokeObjectURL: () => '' });

  await t.test('renderPagePreview calls page.cleanup', async () => {
    // Populate currentPdfDoc via handleFile
    const mockFile = {
      name: 'test.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(8),
    };

    cleanupCalled = false;
    await exports.handleFile([mockFile]);
    assert.strictEqual(cleanupCalled, true, 'page.cleanup() should be called during page render');
  });

  await t.test('handleFile and resetApp destroy existing pdfDoc', async () => {
    await exports.resetApp();
    destroyCount = 0;

    const mockFile1 = {
      name: 'doc1.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(8),
    };
    const mockFile2 = {
      name: 'doc2.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(8),
    };

    await exports.handleFile([mockFile1]);
    assert.strictEqual(destroyCount, 0, 'First handleFile should not destroy as no prior doc existed');

    await exports.handleFile([mockFile2]);
    assert.strictEqual(destroyCount, 1, 'Second handleFile should destroy existing pdfDoc');

    await exports.resetApp();
    assert.strictEqual(destroyCount, 2, 'resetApp should destroy existing pdfDoc');
  });
});

test('add-watermark mode pills accessibility attributes', async (t) => {
  const htmlPath = path.join(__dirname, '../tools/add-watermark/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  await t.test('has role="radiogroup" and aria-label on mode pills container', () => {
    assert.match(html, /id="wm-mode-pills"[^>]*role="radiogroup"/);
    assert.match(html, /id="wm-mode-pills"[^>]*aria-label="Watermark mode"/);
  });

  await t.test('mode pill buttons have role="radio" and aria-checked attributes', () => {
    assert.match(html, /role="radio"[\s\S]*?aria-checked="true"[\s\S]*?data-value="text"/);
    assert.match(html, /role="radio"[\s\S]*?aria-checked="false"[\s\S]*?data-value="image"/);
  });
});

test('add-watermark error handling', async (t) => {
  const mockDocument = createMockDocument();
  let toastCall = null;

  const mockWindow = {
    'pdfjs-dist/build/pdf': {
      getDocument: () => ({
        promise: Promise.reject(new Error('Corrupt or invalid PDF')),
      }),
    },
  };

  const mockInitDropZone = () => {};
  const mockShowToast = (msg, type) => {
    toastCall = { msg, type };
  };
  const mockSetProgress = () => {};
  const mockActivatePill = () => {};

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'setProgress', 'activatePill', 'Blob', 'URL', src);
  const exports = wrapper(mockDocument, mockWindow, mockInitDropZone, mockShowToast, mockSetProgress, mockActivatePill, class Blob {}, { createObjectURL: () => '', revokeObjectURL: () => '' });

  await t.test('handleFile handles getDocument rejection and triggers error toast and reset', async () => {
    toastCall = null;
    const dropZone = mockDocument.getElementById('wm-drop-zone');
    dropZone.style.display = 'none';

    const origConsoleError = console.error;
    console.error = () => {};
    try {
      const mockFile = {
        name: 'corrupt.pdf',
        type: 'application/pdf',
        arrayBuffer: async () => new ArrayBuffer(8),
      };

      await exports.handleFile([mockFile]);

      assert.deepStrictEqual(toastCall, { msg: 'Error loading PDF.', type: 'error' });
      assert.strictEqual(dropZone.style.display, 'block', 'dropZone display should be reset to block after failure');
    } finally {
      console.error = origConsoleError;
    }
  });

  await t.test('handleFile handles file.arrayBuffer failure and triggers error toast and reset', async () => {
    toastCall = null;
    const dropZone = mockDocument.getElementById('wm-drop-zone');
    dropZone.style.display = 'none';

    const origConsoleError = console.error;
    console.error = () => {};
    try {
      const mockFile = {
        name: 'unreadable.pdf',
        type: 'application/pdf',
        arrayBuffer: async () => { throw new Error('File read error'); },
      };

      await exports.handleFile([mockFile]);

      assert.deepStrictEqual(toastCall, { msg: 'Error loading PDF.', type: 'error' });
      assert.strictEqual(dropZone.style.display, 'block', 'dropZone display should be reset to block after failure');
    } finally {
      console.error = origConsoleError;
    }
  });
});
