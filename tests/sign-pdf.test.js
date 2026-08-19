const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/sign-pdf.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Strip import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
// Strip export keywords if present
src = src.replace(/export\s+function/g, 'function');

// Append return statement exposing internal variables and functions for testing
src += '\nreturn { renderPage, handlePdfSelect, handleImageSelect, resetTool, getPdfjsDocument: () => pdfjsDocument, setPdfjsDocument: (doc) => { pdfjsDocument = doc; }, setNumPages: (n) => { numPages = n; }, setCurrentPage: (p) => { currentPage = p; } };\n';

const elementMap = {};

function createMockElement(id = '') {
  if (!elementMap[id]) {
    const classes = new Set();
    elementMap[id] = {
      id,
      value: '',
      style: {},
      classList: {
        add: (cls) => classes.add(cls),
        remove: (cls) => classes.delete(cls),
        contains: (cls) => classes.has(cls)
      },
      appendChild: () => {},
      removeChild: () => {},
      remove: () => {},
      innerHTML: '',
      textContent: '',
      disabled: false,
      clientWidth: 800,
      clientHeight: 600,
      offsetWidth: 800,
      offsetHeight: 600,
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      getContext: () => ({
        scale: () => {},
        clearRect: () => {},
        fillText: () => {},
        measureText: () => ({ width: 100 })
      }),
      toDataURL: () => 'data:image/png;base64,fake',
      click: () => {}
    };
  }
  return elementMap[id];
}

const mockDocument = {
  getElementById: (id) => createMockElement(id),
  querySelectorAll: (selector) => [],
  createElement: (tagName) => createMockElement(`el-${tagName}`),
  body: {
    appendChild: () => {},
    removeChild: () => {}
  }
};

class MockMutationObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
}

class MockSignaturePad {
  constructor() {}
  clear() {}
  toData() { return []; }
  fromData() {}
  isEmpty() { return false; }
  toDataURL() { return 'data:image/png;base64,pad'; }
}

let toastMessages = [];
const mockShowToast = (msg, type) => {
  toastMessages.push({ msg, type });
};

const mockInitDropZone = () => {};
const mockSetProgress = () => {};

let consoleErrors = [];
const mockConsole = {
  error: (...args) => {
    consoleErrors.push(args);
  },
  log: () => {}
};

const mockWindow = {
  devicePixelRatio: 1,
  SignaturePad: MockSignaturePad,
  MutationObserver: MockMutationObserver,
  'pdfjs-dist/build/pdf': {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async () => ({
          getViewport: () => ({ width: 800, height: 600 }),
          render: () => ({ promise: Promise.resolve() })
        })
      })
    })
  },
  PDFLib: {
    PDFDocument: {
      load: async () => ({
        getPages: () => [{ getWidth: () => 612, getHeight: () => 792, drawImage: () => {} }],
        embedPng: async () => ({}),
        embedJpg: async () => ({}),
        save: async () => new Uint8Array([1, 2, 3])
      })
    }
  }
};

global.MutationObserver = MockMutationObserver;

const wrapper = new Function(
  'document',
  'window',
  'initDropZone',
  'showToast',
  'setProgress',
  'Blob',
  'URL',
  'console',
  'MutationObserver',
  src
);

const {
  renderPage,
  handlePdfSelect,
  handleImageSelect,
  resetTool,
  getPdfjsDocument,
  setPdfjsDocument,
  setNumPages,
  setCurrentPage
} = wrapper(
  mockDocument,
  mockWindow,
  mockInitDropZone,
  mockShowToast,
  mockSetProgress,
  class Blob {},
  { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
  mockConsole,
  MockMutationObserver
);

test('sign-pdf renderPage error paths and happy paths', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    consoleErrors = [];
    setNumPages(3);
    setCurrentPage(1);
    elementMap['sign-loading-overlay'].style.display = 'none';
  });

  await t.test('renderPage displays error toast and hides loading overlay when getPage fails', async () => {
    const errorMsg = 'Failed to load page 1';
    setPdfjsDocument({
      getPage: async (pageNum) => {
        throw new Error(errorMsg);
      }
    });

    await renderPage(1);

    // Verify toast was shown with correct message and type
    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Error rendering page preview.');
    assert.strictEqual(toastMessages[0].type, 'error');

    // Verify console.error was called
    assert.strictEqual(consoleErrors.length, 1);
    assert.strictEqual(consoleErrors[0][0].message, errorMsg);

    // Verify loading overlay is hidden in finally block
    assert.strictEqual(elementMap['sign-loading-overlay'].style.display, 'none');
  });

  await t.test('renderPage displays error toast and hides loading overlay when page.render fails', async () => {
    const renderError = 'Canvas render failed';
    setPdfjsDocument({
      getPage: async (pageNum) => ({
        getViewport: ({ scale }) => ({ width: 800 * scale, height: 600 * scale }),
        render: (ctx) => ({
          promise: Promise.reject(new Error(renderError))
        })
      })
    });

    await renderPage(1);

    // Verify toast was shown with correct message and type
    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Error rendering page preview.');
    assert.strictEqual(toastMessages[0].type, 'error');

    // Verify console.error was called
    assert.strictEqual(consoleErrors.length, 1);
    assert.strictEqual(consoleErrors[0][0].message, renderError);

    // Verify loading overlay is hidden in finally block
    assert.strictEqual(elementMap['sign-loading-overlay'].style.display, 'none');
  });

  await t.test('renderPage updates canvas dimensions and page info on success', async () => {
    let renderCalled = false;
    setPdfjsDocument({
      getPage: async (pageNum) => ({
        getViewport: ({ scale }) => ({ width: 800 * scale, height: 600 * scale }),
        render: (ctx) => {
          renderCalled = true;
          return { promise: Promise.resolve() };
        }
      })
    });

    await renderPage(2);

    assert.strictEqual(renderCalled, true);
    assert.strictEqual(elementMap['sign-page-info'].textContent, 'Page 2 of 3');
    assert.strictEqual(elementMap['sign-preview-canvas'].width, 800);
    assert.strictEqual(elementMap['sign-preview-canvas'].height, 600);
    assert.strictEqual(elementMap['sign-loading-overlay'].style.display, 'none');
    assert.strictEqual(toastMessages.length, 0);
  });
});

test('sign-pdf file selection error paths', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    consoleErrors = [];
  });

  await t.test('handlePdfSelect rejects non-pdf file and shows toast', async () => {
    const invalidFile = { name: 'document.docx', type: 'application/msword' };
    await handlePdfSelect([invalidFile]);

    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Please select a valid PDF file.');
    assert.strictEqual(toastMessages[0].type, 'error');
  });

  await t.test('handleImageSelect rejects non-image file and shows toast', async () => {
    const invalidFile = { name: 'document.pdf', type: 'application/pdf' };
    await handleImageSelect([invalidFile]);

    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Please upload a valid image file (PNG/JPG).');
    assert.strictEqual(toastMessages[0].type, 'error');
  });
});
