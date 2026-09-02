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
src += '\nreturn { getPdfPositionOffset, getPdfCoordinates, getPageConfig, applyWatermarkScope };\n';

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
  const { getPageConfig, applyWatermarkScope } = wrapper(mockDocument, mockWindow, mockInitDropZone, mockShowToast, mockSetProgress, mockActivatePill, class Blob {}, { createObjectURL: () => '', revokeObjectURL: () => '' });

  await t.test('returns default page config', () => {
    const config = getPageConfig(1);
    assert.strictEqual(config.position, 'center');
    assert.strictEqual(config.fontSize, 48);
    assert.strictEqual(config.scale, 1);
  });

  await t.test('applies scope to page or all pages', () => {
    applyWatermarkScope('page', 2);
    assert.strictEqual(toastMessage, 'Applied change to page 2 only');

    applyWatermarkScope('all', 1);
    assert.strictEqual(toastMessage, 'Applied change to all pages');
  });
});
