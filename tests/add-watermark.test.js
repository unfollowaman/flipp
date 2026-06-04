const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/add-watermark.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

// Expose functions for testing
src += '\nreturn { getPdfPositionOffset, getPdfCoordinates };\n';

test('getPdfPositionOffset functionality', async (t) => {
  const createMockElement = (id = '') => {
    const el = {
      id,
      value: '',
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
      getContext: () => ({})
    };
    return el;
  };

  const mockDocument = {
    getElementById: createMockElement,
    createElement: () => createMockElement(),
    querySelectorAll: () => []
  };

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
    // dx0 = -25, dy0 = -25
    // dxRot = -25 * cos(0) - -25 * sin(0) = -25
    // dyRot = -25 * sin(0) + -25 * cos(0) = -25
    // result.dx = 100 - 25 = 75
    // result.dy = 100 - 25 = 75
    assert.strictEqual(Math.round(result.dx), 75);
    assert.strictEqual(Math.round(result.dy), 75);
  });

  await t.test('calculates correct offset for 90 degree rotation', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = 90;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    // angle = -90 degrees (-PI/2)
    // dx0 = -25, dy0 = -25
    // dxRot = -25 * cos(-PI/2) - -25 * sin(-PI/2) = 0 - (-25 * -1) = -25
    // dyRot = -25 * sin(-PI/2) + -25 * cos(-PI/2) = (-25 * -1) + 0 = 25
    // dx = 100 - 25 = 75
    // dy = 100 + 25 = 125
    assert.strictEqual(Math.round(result.dx), 75);
    assert.strictEqual(Math.round(result.dy), 125);
  });

  await t.test('calculates correct offset for 180 degree rotation', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = 180;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    // angle = -180 degrees (-PI)
    // dx0 = -25, dy0 = -25
    // dxRot = -25 * cos(-PI) - -25 * sin(-PI) = -25 * -1 - 0 = 25
    // dyRot = -25 * sin(-PI) + -25 * cos(-PI) = 0 + -25 * -1 = 25
    // dx = 100 + 25 = 125
    // dy = 100 + 25 = 125
    assert.strictEqual(Math.round(result.dx), 125);
    assert.strictEqual(Math.round(result.dy), 125);
  });

  await t.test('calculates correct offset for 270 degree rotation', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = 270;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    // angle = -270 (-3PI/2) or 90
    // cos(90) = 0, sin(90) = 1
    // dx0 = -25, dy0 = -25
    // dxRot = -25 * 0 - (-25 * 1) = 25
    // dyRot = -25 * 1 + -25 * 0 = -25
    // dx = 100 + 25 = 125
    // dy = 100 - 25 = 75
    assert.strictEqual(Math.round(result.dx), 125);
    assert.strictEqual(Math.round(result.dy), 75);
  });

  await t.test('handles non-square items and origin (0,0)', () => {
    const cx = 0, cy = 0, w = 100, h = 50, rot = 45;
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    // angle = -45 (-PI/4)
    // cos(-PI/4) = 0.707, sin(-PI/4) = -0.707
    // dx0 = -50, dy0 = -25
    // dxRot = -50 * 0.707 - (-25 * -0.707) = -35.35 - 17.67 = -53.03
    // dyRot = -50 * -0.707 + -25 * 0.707 = 35.35 - 17.67 = 17.67

    // Exact JS calculations
    const rad = -45 * (Math.PI / 180);
    const expectedDx = -50 * Math.cos(rad) - (-25 * Math.sin(rad));
    const expectedDy = -50 * Math.sin(rad) + (-25 * Math.cos(rad));

    assert.strictEqual(result.dx, expectedDx);
    assert.strictEqual(result.dy, expectedDy);
  });

  await t.test('handles negative rotation angles', () => {
    const cx = 100, cy = 100, w = 50, h = 50, rot = -90;
    // -90 rot is same as 270 rot mathematically for offset?
    // angle = 90 (PI/2)
    // dx0 = -25, dy0 = -25
    // dxRot = -25 * cos(PI/2) - (-25 * sin(PI/2)) = 0 - (-25) = 25
    // dyRot = -25 * sin(PI/2) + -25 * cos(PI/2) = -25 + 0 = -25
    // dx = 100 + 25 = 125, dy = 100 - 25 = 75
    const result = getPdfPositionOffset(cx, cy, w, h, rot);
    assert.strictEqual(Math.round(result.dx), 125);
    assert.strictEqual(Math.round(result.dy), 75);
  });
});

test('getPdfCoordinates functionality', async (t) => {
  const createMockElement = (id = '') => {
    const el = {
      id,
      value: '',
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
      getContext: () => ({})
    };
    return el;
  };

  const mockDocument = {
    getElementById: createMockElement,
    createElement: () => createMockElement(),
    querySelectorAll: () => []
  };

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
