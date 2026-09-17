const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-split.js');
let src = fs.readFileSync(srcPath, 'utf8');

src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

src += '\nreturn { loadPdfMetadataAndPreviews, renderPagePreview, addFiles };\n';

test('pdf-split error handling', async (t) => {
  const elementMap = {};

  const createMockElement = (id = '') => {
    if (!elementMap[id]) {
      elementMap[id] = {
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
      };
    }
    return elementMap[id];
  };

  const mockDocument = {
    getElementById: createMockElement,
    createElement: () => createMockElement()
  };

  const mockWindow = {
    PDFLib: {
      PDFDocument: {
        load: async () => ({
          getPageCount: () => 2
        })
      }
    },
    'pdfjs-dist/build/pdf': {
      getDocument: () => ({
        promise: Promise.resolve({
          getPage: async (num) => {
            throw new Error('Mock getPage error');
          }
        })
      })
    }
  };

  let toastMessage = null;
  const mockShowToast = (msg, type) => {
    toastMessage = msg;
  };

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', 'console', src);

  // We need to pass a custom console to ignore the console.error expected during test
  const mockConsole = {
    error: () => {}
  };

  const { loadPdfMetadataAndPreviews, renderPagePreview } = wrapper(
    mockDocument,
    mockWindow,
    () => {}, // initDropZone
    mockShowToast,
    class Blob {},
    { createObjectURL: () => '', revokeObjectURL: () => '' },
    mockConsole
  );

  await t.test('renderPagePreview catches and displays error when getPage fails', async () => {
    const fakeFile = {
      name: 'test.pdf',
      arrayBuffer: async () => new ArrayBuffer(0)
    };

    // Call loadPdfMetadataAndPreviews to set pdfDocument and totalPages
    await loadPdfMetadataAndPreviews(fakeFile);

    const container = createMockElement('preview-container');
    await renderPagePreview(1, container);

    assert.strictEqual(container.textContent, 'Error rendering page');
  });
});

test('pdf-split resource cleanup', async (t) => {
  const elementMap = {};

  const createMockElement = (id = '') => {
    if (!elementMap[id]) {
      elementMap[id] = {
        id,
        value: '',
        style: { display: '' },
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        appendChild: () => {},
        innerHTML: '',
        textContent: '',
        addEventListener: (event, handler) => {
          if (!elementMap[id].listeners) elementMap[id].listeners = {};
          elementMap[id].listeners[event] = handler;
        },
        querySelector: () => createMockElement(),
        querySelectorAll: () => [],
      };
    }
    return elementMap[id];
  };

  const mockDocument = {
    getElementById: (id) => createMockElement(id),
    createElement: () => createMockElement()
  };

  let cleanupCalled = false;
  let destroyCallCount = 0;

  const mockPdfDocument = {
    getPage: async (num) => ({
      getViewport: () => ({ width: 100, height: 100 }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: () => {
        cleanupCalled = true;
      }
    }),
    destroy: async () => {
      destroyCallCount++;
    }
  };

  const mockWindow = {
    PDFLib: {
      PDFDocument: {
        load: async () => ({
          getPageCount: () => 3
        })
      }
    },
    'pdfjs-dist/build/pdf': {
      getDocument: () => ({
        promise: Promise.resolve(mockPdfDocument)
      })
    }
  };

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', 'console', src);

  const { loadPdfMetadataAndPreviews, renderPagePreview } = wrapper(
    mockDocument,
    mockWindow,
    () => {},
    () => {},
    class Blob {},
    { createObjectURL: () => '', revokeObjectURL: () => '' },
    { error: () => {}, warn: () => {} }
  );

  await t.test('calls page.cleanup() after page preview render', async () => {
    cleanupCalled = false;
    const fakeFile = {
      name: 'test.pdf',
      arrayBuffer: async () => new ArrayBuffer(0)
    };
    await loadPdfMetadataAndPreviews(fakeFile);

    const container = createMockElement('preview-container');
    await renderPagePreview(1, container);

    assert.strictEqual(cleanupCalled, true);
  });

  await t.test('calls pdfDocument.destroy() on reload and reset', async () => {
    const resetBtn = mockDocument.getElementById('split-reset-btn');
    if (resetBtn.listeners && resetBtn.listeners['click']) {
      resetBtn.listeners['click']();
    }

    destroyCallCount = 0;
    const fakeFile1 = { name: 'test1.pdf', arrayBuffer: async () => new ArrayBuffer(0) };
    const fakeFile2 = { name: 'test2.pdf', arrayBuffer: async () => new ArrayBuffer(0) };

    // Initial load sets pdfDocument for the first time (destroyCallCount is 0)
    await loadPdfMetadataAndPreviews(fakeFile1);
    assert.strictEqual(destroyCallCount, 0);

    // Re-loading new file should destroy old pdfDocument (destroyCallCount becomes 1)
    await loadPdfMetadataAndPreviews(fakeFile2);
    assert.strictEqual(destroyCallCount, 1);

    // Reset button click should destroy active pdfDocument (destroyCallCount becomes 2)
    if (resetBtn.listeners && resetBtn.listeners['click']) {
      resetBtn.listeners['click']();
    }
    assert.strictEqual(destroyCallCount, 2);
  });
});

test('pdf-split N-page splitting logic', async (t) => {
  const elementMap = {};

  const createMockElement = (id = '') => {
    if (!elementMap[id]) {
      elementMap[id] = {
        id,
        value: '',
        checked: false,
        disabled: false,
        style: { display: '', opacity: '', pointerEvents: '' },
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        appendChild: (child) => {
          if (!elementMap[id].children) elementMap[id].children = [];
          elementMap[id].children.push(child);
        },
        innerHTML: '',
        textContent: '',
        addEventListener: (event, handler) => {
          if (!elementMap[id].listeners) elementMap[id].listeners = {};
          elementMap[id].listeners[event] = handler;
        },
        querySelector: () => createMockElement(),
        querySelectorAll: () => [],
      };
    }
    return elementMap[id];
  };

  const mockDocument = {
    getElementById: (id) => createMockElement(id),
    createElement: (tag) => createMockElement(`created-${tag}-${Math.random()}`)
  };

  let createdDocuments = [];

  class MockPDFDocument {
    constructor(pageCount) {
      this._pageCount = pageCount;
      this.pages = Array.from({ length: pageCount }, (_, i) => ({ id: i + 1 }));
    }
    getPageCount() {
      return this._pageCount;
    }
    async copyPages(srcPdf, pageIndexes) {
      return pageIndexes.map((idx) => srcPdf.pages[idx]);
    }
    addPage(page) {
      if (!this.addedPages) this.addedPages = [];
      this.addedPages.push(page);
    }
    async save() {
      return new Uint8Array([1, 2, 3]);
    }
  }

  const mockWindow = {
    PDFLib: {
      PDFDocument: {
        load: async (buffer) => {
          return new MockPDFDocument(buffer.mockPageCount || 10);
        },
        create: async () => {
          const doc = new MockPDFDocument(0);
          createdDocuments.push(doc);
          return doc;
        }
      }
    },
    'pdfjs-dist/build/pdf': {
      getDocument: () => ({
        promise: Promise.resolve({
          getPage: async (num) => ({
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() })
          })
        })
      })
    }
  };

  let toastMessage = null;
  const mockShowToast = (msg, type) => {
    toastMessage = msg;
  };

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', 'console', src);

  const mockConsole = { error: () => {}, warn: () => {} };

  const { loadPdfMetadataAndPreviews, addFiles } = wrapper(
    mockDocument,
    mockWindow,
    () => {},
    mockShowToast,
    class Blob { constructor(content, opts) { this.content = content; this.opts = opts; } },
    { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    mockConsole
  );

  const splitBtn = mockDocument.getElementById('split-btn');
  const checkbox = mockDocument.getElementById('split-n-checkbox');
  const inputN = mockDocument.getElementById('split-n-input');

  const runSplit = async (pageCount, isNMode, nValue) => {
    createdDocuments = [];
    const buffer = new ArrayBuffer(8);
    buffer.mockPageCount = pageCount;
    const fakeFile = {
      name: 'document.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => buffer
    };

    addFiles([fakeFile]);
    await loadPdfMetadataAndPreviews(fakeFile);

    checkbox.checked = isNMode;
    inputN.value = String(nValue);

    await splitBtn.listeners['click']();
    return createdDocuments;
  };

  await t.test('N = 1 produces 1 PDF per page', async () => {
    const docs = await runSplit(5, true, 1);
    assert.strictEqual(docs.length, 5);
    docs.forEach((doc) => {
      assert.strictEqual(doc.addedPages.length, 1);
    });
  });

  await t.test('N = 2 correctly groups pages into pairs', async () => {
    const docs = await runSplit(10, true, 2);
    assert.strictEqual(docs.length, 5);
    docs.forEach((doc) => {
      assert.strictEqual(doc.addedPages.length, 2);
    });
  });

  await t.test('N = 3 correctly handles a remainder', async () => {
    const docs = await runSplit(7, true, 3);
    assert.strictEqual(docs.length, 3);
    assert.strictEqual(docs[0].addedPages.length, 3);
    assert.strictEqual(docs[1].addedPages.length, 3);
    assert.strictEqual(docs[2].addedPages.length, 1);
  });

  await t.test('N equal to page count produces one PDF', async () => {
    const docs = await runSplit(5, true, 5);
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].addedPages.length, 5);
  });

  await t.test('N greater than page count produces one PDF containing all pages', async () => {
    const docs = await runSplit(5, true, 10);
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].addedPages.length, 5);
  });

  await t.test('1-page PDF produces 1 PDF when N mode is enabled', async () => {
    const docs = await runSplit(1, true, 1);
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].addedPages.length, 1);
  });

  await t.test('Default 2-part split behavior remains unchanged when checkbox is OFF', async () => {
    const docs = await runSplit(10, false, 1);
    // Note: loadPdfMetadataAndPreviews automatically sets rangeStartEl to "1" and rangeEndEl to Math.max(1, totalPages - 1) = "9"
    assert.strictEqual(docs.length, 2);
    assert.strictEqual(docs[0].addedPages.length, 9); // pages 1-9
    assert.strictEqual(docs[1].addedPages.length, 1); // page 10
  });
});
