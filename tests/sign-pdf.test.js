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
src += '\nreturn { renderPage, handlePdfSelect, handleImageSelect, resetTool, createSignatureOverlay, getPdfjsDocument: () => pdfjsDocument, setPdfjsDocument: (doc) => { pdfjsDocument = doc; }, setNumPages: (n) => { numPages = n; }, setCurrentPage: (p) => { currentPage = p; } };\n';

const elementMap = {};

function createMockElement(id = '') {
  if (!elementMap[id]) {
    const classes = new Set();
    const attrs = {};
    elementMap[id] = {
      id,
      value: '',
      style: {},
      dataset: {},
      attributes: attrs,
      setAttribute: (attr, val) => { attrs[attr] = String(val); },
      getAttribute: (attr) => attrs[attr] || null,
      removeAttribute: (attr) => { delete attrs[attr]; },
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
  createSignatureOverlay,
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

    // Verify loading overlay is hidden in finally block
    assert.strictEqual(elementMap['sign-loading-overlay'].style.display, 'none');
  });

  await t.test('renderPage updates canvas dimensions and page info on success and calls page.cleanup()', async () => {
    let renderCalled = false;
    let cleanupCalled = false;
    setPdfjsDocument({
      getPage: async (pageNum) => ({
        getViewport: ({ scale }) => ({ width: 800 * scale, height: 600 * scale }),
        render: (ctx) => {
          renderCalled = true;
          return { promise: Promise.resolve() };
        },
        cleanup: () => {
          cleanupCalled = true;
        }
      })
    });

    await renderPage(2);

    assert.strictEqual(renderCalled, true);
    assert.strictEqual(cleanupCalled, true);
    assert.strictEqual(elementMap['sign-page-info'].textContent, 'Page 2 of 3');
    assert.strictEqual(elementMap['sign-preview-canvas'].width, 800);
    assert.strictEqual(elementMap['sign-preview-canvas'].height, 600);
    assert.strictEqual(elementMap['sign-loading-overlay'].style.display, 'none');
    assert.strictEqual(toastMessages.length, 0);
  });
});

test('sign-pdf resource cleanup on reset and reload', async (t) => {
  await t.test('resetTool calls destroy on existing pdfjsDocument', async () => {
    let destroyCalled = false;
    setPdfjsDocument({
      destroy: () => {
        destroyCalled = true;
      }
    });

    resetTool();

    assert.strictEqual(destroyCalled, true);
    assert.strictEqual(getPdfjsDocument(), null);
  });

  await t.test('handlePdfSelect destroys existing pdfjsDocument before loading new one', async () => {
    let destroyCalled = false;
    setPdfjsDocument({
      destroy: async () => {
        destroyCalled = true;
      }
    });

    const file = {
      name: 'test.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(8)
    };

    await handlePdfSelect([file]);

    assert.strictEqual(destroyCalled, true);
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

test('sign-pdf createSignatureOverlay', async (t) => {
  await t.test('createSignatureOverlay sets delete handle textContent correctly', () => {
    const appendedElements = [];
    elementMap['sign-canvas-container'].appendChild = (child) => {
      appendedElements.push(child);
    };

    const createdElements = [];
    let elemIdSeq = 0;
    const origCreateElement = mockDocument.createElement;
    mockDocument.createElement = (tagName) => {
      const el = createMockElement(`temp-el-${elemIdSeq++}`);
      createdElements.push(el);
      return el;
    };

    createSignatureOverlay('data:image/png;base64,sample');

    const deleteBtn = createdElements.find((el) => el.className === 'delete-handle');
    assert.ok(deleteBtn, 'Delete handle should be created');
    assert.strictEqual(deleteBtn.textContent, '✕');
    assert.strictEqual(deleteBtn.innerHTML, '');

    const resizeBtn = createdElements.find((el) => el.className === 'resize-handle');
    assert.ok(resizeBtn, 'Resize handle should be created');

    mockDocument.createElement = origCreateElement;
  });

  await t.test('createSignatureOverlay sets accessibility attributes on delete and resize handles', () => {
    const origCreateElement = mockDocument.createElement;
    const createdElements = [];
    let elemIdSeq = 100;
    mockDocument.createElement = (tagName) => {
      const el = createMockElement(`temp-el-${elemIdSeq++}`);
      createdElements.push(el);
      return el;
    };

    createSignatureOverlay('data:image/png;base64,sample');

    const deleteBtn = createdElements.find((el) => el.className === 'delete-handle');
    assert.ok(deleteBtn, 'Delete button element should exist');
    assert.strictEqual(deleteBtn.getAttribute('role'), 'button');
    assert.strictEqual(deleteBtn.getAttribute('tabindex'), '0');
    assert.strictEqual(deleteBtn.getAttribute('aria-label'), 'Remove signature');
    assert.strictEqual(deleteBtn.getAttribute('title'), 'Remove signature');

    const resizeHandle = createdElements.find((el) => el.className === 'resize-handle');
    assert.ok(resizeHandle, 'Resize handle element should exist');
    assert.strictEqual(resizeHandle.getAttribute('aria-label'), 'Resize signature');
    assert.strictEqual(resizeHandle.getAttribute('title'), 'Resize signature');

    mockDocument.createElement = origCreateElement;
  });
});
