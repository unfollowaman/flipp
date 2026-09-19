const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-page-numbers.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

test('pdf-page-numbers error handling', async (t) => {
  let mockAddClick;
  let addFilesCallback;
  let toastMessage = null;
  let toastType = null;

  const createMockElement = (id = '') => {
    const el = {
      id,
      value: '',
      style: { display: '' },
      dataset: { value: '' },
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      appendChild: () => {},
      closest: () => null,
      innerHTML: '',
      textContent: '',
      addEventListener: (event, handler) => {
        if (id === 'number-btn' && event === 'click') {
          mockAddClick = handler;
        }
      },
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      getAttribute: () => null,
      setAttribute: () => {},
      removeAttribute: () => {}
    };
    return el;
  };

  const mockDocument = {
    getElementById: createMockElement,
    createElement: () => createMockElement()
  };

  const mockWindow = {};
  const mockInitDropZone = (dz, fi, cb) => {
    addFilesCallback = cb;
  };
  const mockShowToast = (msg, type) => {
    toastMessage = msg;
    toastType = type;
  };

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', 'fetch', src);

  t.beforeEach(() => {
    toastMessage = null;
    toastType = null;
    mockAddClick = undefined;
    addFilesCallback = undefined;

    wrapper(
      mockDocument,
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      () => {}
    );
  });

  await t.test('shows error toast when a non-PDF file is added', async () => {
    addFilesCallback([
      { type: 'image/png', name: 'image.png' }
    ]);
    assert.strictEqual(toastMessage, 'Please choose a PDF file.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('shows error toast when PDFLib is unavailable on add click', async () => {
    addFilesCallback([
      { type: 'application/pdf', name: 'document.pdf', arrayBuffer: async () => new ArrayBuffer(0) }
    ]);
    mockWindow.PDFLib = undefined;
    await mockAddClick();
    assert.strictEqual(toastMessage, 'Could not add page numbers. Please try another PDF.');
    assert.strictEqual(toastType, 'error');
  });
});

test('pdf-page-numbers font caching behavior', async (t) => {
  let mockAddClick;
  let addFilesCallback;
  let fetchCallCount = 0;

  const createMockElement = (id = '') => {
    const el = {
      id,
      value: '1',
      style: { display: '' },
      dataset: { value: '' },
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      appendChild: () => {},
      closest: () => null,
      innerHTML: '',
      textContent: '',
      addEventListener: (event, handler) => {
        if (id === 'number-btn' && event === 'click') {
          mockAddClick = handler;
        }
      },
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      getAttribute: () => null,
      setAttribute: () => {},
      removeAttribute: () => {}
    };
    return el;
  };

  const mockDocument = {
    getElementById: createMockElement,
    createElement: () => createMockElement()
  };

  const mockPage = {
    getSize: () => ({ width: 600, height: 800 }),
    drawText: () => {}
  };

  const mockFont = {
    widthOfTextAtSize: () => 10
  };

  const mockPdfDoc = {
    registerFontkit: () => {},
    embedFont: async () => mockFont,
    getPages: () => [mockPage],
    save: async () => new Uint8Array([1, 2, 3])
  };

  const mockWindow = {
    fontkit: {},
    PDFLib: {
      PDFDocument: {
        load: async () => mockPdfDoc
      },
      rgb: () => ({})
    }
  };

  const mockFetch = async () => {
    fetchCallCount++;
    return {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16)
    };
  };

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', 'fetch', src);

  wrapper(
    mockDocument,
    mockWindow,
    (dz, fi, cb) => { addFilesCallback = cb; },
    () => {},
    class Blob {},
    { createObjectURL: () => '', revokeObjectURL: () => '' },
    mockFetch
  );

  addFilesCallback([
    { type: 'application/pdf', name: 'document.pdf', arrayBuffer: async () => new ArrayBuffer(0) }
  ]);

  await mockAddClick();
  assert.strictEqual(fetchCallCount, 1, 'First click should trigger 1 fetch for the font');

  await mockAddClick();
  assert.strictEqual(fetchCallCount, 1, 'Second click should use cached font without additional fetch calls');
});
