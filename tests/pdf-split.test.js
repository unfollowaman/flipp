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
  let toastType = null;
  const mockShowToast = (msg, type) => {
    toastMessage = msg;
    toastType = type;
  };

  let loggedErrors = [];
  const mockConsole = {
    error: (...args) => {
      loggedErrors.push(args);
    }
  };

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', 'console', src);

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

  await t.test('loadPdfMetadataAndPreviews handles error when PDFLib.PDFDocument.load fails', async () => {
    toastMessage = null;
    toastType = null;
    loggedErrors = [];

    const mockBadWindow = {
      PDFLib: {
        PDFDocument: {
          load: async () => {
            throw new Error('Malformed PDF file');
          }
        }
      },
      'pdfjs-dist/build/pdf': mockWindow['pdfjs-dist/build/pdf']
    };

    const badWrapper = wrapper(
      mockDocument,
      mockBadWindow,
      () => {},
      mockShowToast,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      mockConsole
    );

    const fakeFile = {
      name: 'corrupted.pdf',
      arrayBuffer: async () => new ArrayBuffer(0)
    };

    await badWrapper.loadPdfMetadataAndPreviews(fakeFile);

    assert.strictEqual(toastMessage, 'Failed to read PDF page count.');
    assert.strictEqual(toastType, 'error');
    assert.strictEqual(mockDocument.getElementById('split-info').textContent, 'Selected: corrupted.pdf');
    assert.strictEqual(loggedErrors.length, 1);
    assert.strictEqual(loggedErrors[0][0].message, 'Malformed PDF file');
  });

  await t.test('loadPdfMetadataAndPreviews handles error when pdfjsLib.getDocument fails', async () => {
    toastMessage = null;
    toastType = null;
    loggedErrors = [];

    const mockBadPdfJsWindow = {
      PDFLib: mockWindow.PDFLib,
      'pdfjs-dist/build/pdf': {
        getDocument: () => ({
          promise: Promise.reject(new Error('pdf.js getDocument rejected'))
        })
      }
    };

    const badWrapper = wrapper(
      mockDocument,
      mockBadPdfJsWindow,
      () => {},
      mockShowToast,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      mockConsole
    );

    const fakeFile = {
      name: 'preview-fail.pdf',
      arrayBuffer: async () => new ArrayBuffer(0)
    };

    await badWrapper.loadPdfMetadataAndPreviews(fakeFile);

    assert.strictEqual(toastMessage, 'Failed to read PDF page count.');
    assert.strictEqual(toastType, 'error');
    assert.strictEqual(mockDocument.getElementById('split-info').textContent, 'Selected: preview-fail.pdf');
    assert.strictEqual(loggedErrors.length, 1);
    assert.strictEqual(loggedErrors[0][0].message, 'pdf.js getDocument rejected');
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

  await t.test('discards superseded render requests when a newer render is requested', async () => {
    let renderedPages = [];
    const slowPdfDocument = {
      getPage: async (num) => {
        if (num === 1) await new Promise((r) => setTimeout(r, 30));
        return {
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({
            promise: Promise.resolve().then(() => {
              renderedPages.push(num);
            })
          }),
          cleanup: () => {}
        };
      },
      destroy: async () => {}
    };

    const mockSlowElementMap = {};
    const createMockSlowElement = (id = '') => {
      const key = id || Math.random().toString();
      if (!mockSlowElementMap[key]) {
        mockSlowElementMap[key] = {
          id: key,
          value: '',
          style: {},
          classList: { add: () => {}, remove: () => {}, contains: () => false },
          appendChild: () => {},
          innerHTML: '',
          textContent: '',
          addEventListener: () => {},
          getContext: () => ({}),
          querySelector: () => createMockSlowElement(),
          querySelectorAll: () => [],
        };
      }
      return mockSlowElementMap[key];
    };

    const mockSlowDoc = {
      getElementById: createMockSlowElement,
      createElement: () => createMockSlowElement()
    };

    const mockSlowWindow = {
      PDFLib: {
        PDFDocument: {
          load: async () => ({
            getPageCount: () => 5
          })
        }
      },
      'pdfjs-dist/build/pdf': {
        getDocument: () => ({ promise: Promise.resolve(slowPdfDocument) })
      }
    };

    const slowWrapper = wrapper(
      mockSlowDoc,
      mockSlowWindow,
      () => {},
      () => {},
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      { error: () => {}, warn: () => {} }
    );

    const fakeFile = { name: 'test.pdf', arrayBuffer: async () => new ArrayBuffer(0) };
    await slowWrapper.loadPdfMetadataAndPreviews(fakeFile);

    const container = createMockSlowElement('preview-container');
    renderedPages = [];

    // Trigger render for page 1 then immediately page 2
    const p1 = slowWrapper.renderPagePreview(1, container);
    const p2 = slowWrapper.renderPagePreview(2, container);

    await Promise.all([p1, p2]);

    // Page 1 should have been superseded and NOT rendered
    assert.deepStrictEqual(renderedPages, [2]);
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
