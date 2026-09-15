const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/delete-pdf-pages.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Strip ES module imports
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

// Append return statement to access internal functions for testing
src += '\nreturn { handleFiles, loadPdfAndRenderThumbnails, updatePagesOrder, resetDelete };\n';

test('delete-pdf-pages functionality', async (t) => {
  let deleteBtnClick;
  let downloadBtnClick;
  let resetBtnClick;
  let toastMessage = null;
  let toastType = null;
  let setupDragReorderCalls = [];
  let setProgressCalls = [];

  const elementMap = {};

  const createMockElement = (id = '', tagName = 'div') => {
    const children = [];
    const eventListeners = {};
    const attributes = {};
    let innerHTMLVal = '';

    const el = {
      id,
      tagName: tagName.toUpperCase(),
      value: '',
      style: { display: '', cssText: '' },
      dataset: {},
      children,
      classList: {
        add: (cls) => { el.classList._classes.add(cls); },
        remove: (cls) => { el.classList._classes.delete(cls); },
        contains: (cls) => el.classList._classes.has(cls),
        _classes: new Set()
      },
      appendChild: (child) => {
        if (child && Array.isArray(child.children) && child.isFragment) {
          child.children.forEach((c) => {
            children.push(c);
            c.parentElement = el;
          });
          child.children.length = 0;
        } else if (child) {
          children.push(child);
          child.parentElement = el;
        }
      },
      removeChild: (child) => {
        const idx = children.indexOf(child);
        if (idx !== -1) children.splice(idx, 1);
      },
      remove: () => {
        if (el.parentElement) {
          el.parentElement.removeChild(el);
        }
      },
      textContent: '',
      addEventListener: (event, handler) => {
        eventListeners[event] = handler;
        if (id === 'delete-btn' && event === 'click') deleteBtnClick = handler;
        if (id === 'delete-download-btn' && event === 'click') downloadBtnClick = handler;
        if (id === 'delete-reset-btn' && event === 'click') resetBtnClick = handler;
      },
      querySelector: (selector) => {
        if (selector === '.img-thumb-num') return children.find(c => c.className === 'img-thumb-num') || createMockElement('', 'div');
        if (selector === '.img-thumb-label') return children.find(c => c.className === 'img-thumb-label') || createMockElement('', 'div');
        if (selector === '.img-thumb-remove') return children.find(c => c.className === 'img-thumb-remove') || createMockElement('', 'button');
        return createMockElement('', 'div');
      },
      querySelectorAll: (selector) => {
        if (selector === '.img-thumb-card') return children.filter(c => c.className === 'img-thumb-card');
        return [];
      },
      click: () => {
        if (eventListeners['click']) eventListeners['click']({ stopPropagation: () => {} });
        if (el.onclick) el.onclick({ stopPropagation: () => {} });
      },
      getAttribute: (name) => attributes[name] || null,
      setAttribute: (name, val) => { attributes[name] = val; },
      removeAttribute: (name) => { delete attributes[name]; }
    };

    Object.defineProperty(el, 'innerHTML', {
      get: () => innerHTMLVal,
      set: (val) => {
        innerHTMLVal = val;
        if (val === '') children.length = 0;
      }
    });

    return el;
  };

  const mockDocument = {
    getElementById: (id) => {
      if (!elementMap[id]) elementMap[id] = createMockElement(id);
      return elementMap[id];
    },
    createElement: (tag) => {
      if (tag === 'canvas') {
        const canvas = createMockElement('', 'canvas');
        canvas.getContext = () => ({});
        canvas.toDataURL = () => 'data:image/png;base64,fake';
        return canvas;
      }
      return createMockElement('', tag);
    },
    createDocumentFragment: () => {
      const children = [];
      return {
        isFragment: true,
        appendChild: (child) => children.push(child),
        children
      };
    }
  };

  const mockWindow = {};
  const mockInitDropZone = (dz, fi, cb) => {};
  const mockShowToast = (msg, type) => {
    toastMessage = msg;
    toastType = type;
  };
  const mockSetProgress = (bar, label, pct, text) => {
    setProgressCalls.push({ pct, text });
  };
  const mockSetupDragReorder = (card, onReorder) => {
    setupDragReorderCalls.push({ card, onReorder });
  };

  let createdObjectUrl = null;
  let revokedObjectUrl = null;
  const mockURL = {
    createObjectURL: (blob) => {
      createdObjectUrl = 'blob:http://localhost/fake-url';
      return createdObjectUrl;
    },
    revokeObjectURL: (url) => {
      revokedObjectUrl = url;
    }
  };

  class MockBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options ? options.type : '';
    }
  }

  const mockRenderPageToDataUrl = async (page, viewport, type, quality) => {
    const canvas = mockDocument.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL(type, quality);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  };

  const wrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setProgress',
    'setupDragReorder',
    'renderPageToDataUrl',
    'Blob',
    'URL',
    'setTimeout',
    src
  );

  let handleFiles, loadPdfAndRenderThumbnails, updatePagesOrder, resetDelete;

  t.beforeEach(() => {
    toastMessage = null;
    toastType = null;
    deleteBtnClick = undefined;
    downloadBtnClick = undefined;
    resetBtnClick = undefined;
    setupDragReorderCalls = [];
    setProgressCalls = [];
    createdObjectUrl = null;
    revokedObjectUrl = null;
    for (const k in elementMap) delete elementMap[k];

    const exportsObj = wrapper(
      mockDocument,
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetProgress,
      mockSetupDragReorder,
      mockRenderPageToDataUrl,
      MockBlob,
      mockURL,
      setTimeout
    );

    handleFiles = exportsObj.handleFiles;
    loadPdfAndRenderThumbnails = exportsObj.loadPdfAndRenderThumbnails;
    updatePagesOrder = exportsObj.updatePagesOrder;
    resetDelete = exportsObj.resetDelete;
  });

  await t.test('returns early without error when handleFiles is called with null, undefined, or empty array', async () => {
    assert.doesNotThrow(() => handleFiles(null));
    assert.doesNotThrow(() => handleFiles(undefined));
    assert.doesNotThrow(() => handleFiles([]));
    assert.strictEqual(toastMessage, null);
  });

  await t.test('shows error toast when non-PDF file is selected', async () => {
    handleFiles([{ name: 'sample.txt', type: 'text/plain' }]);
    assert.strictEqual(toastMessage, 'Please select a PDF file.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('shows error toast if PDF.js is missing when loading PDF', async () => {
    mockWindow['pdfjs-dist/build/pdf'] = undefined;
    const fakeFile = {
      name: 'sample.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(16)
    };
    handleFiles([fakeFile]);
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(toastMessage, 'Error loading PDF.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('loads PDF and renders page thumbnail cards with accessible delete controls', async () => {
    mockWindow['pdfjs-dist/build/pdf'] = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 3,
          getPage: async (i) => ({
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() })
          })
        })
      })
    };

    const fakeFile = {
      name: 'doc.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(16)
    };

    handleFiles([fakeFile]);
    await new Promise((r) => setTimeout(r, 10));

    const grid = mockDocument.getElementById('delete-preview-grid');
    const countEl = mockDocument.getElementById('delete-file-count');
    const previewArea = mockDocument.getElementById('delete-preview-area');

    assert.strictEqual(grid.children.length, 3);
    assert.strictEqual(countEl.textContent, '3 pages');
    assert.strictEqual(previewArea.classList.contains('is-visible'), true);

    const rmBtn0 = grid.children[0].children.find(c => c.className === 'img-thumb-remove');
    assert.strictEqual(rmBtn0.getAttribute('aria-label'), 'Delete page 1');
  });

  await t.test('deleting a page updates remaining count and page numbers', async () => {
    mockWindow['pdfjs-dist/build/pdf'] = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 3,
          getPage: async (i) => ({
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() })
          })
        })
      })
    };

    const fakeFile = {
      name: 'three-pages.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(16)
    };

    handleFiles([fakeFile]);
    await new Promise((r) => setTimeout(r, 10));

    const grid = mockDocument.getElementById('delete-preview-grid');
    assert.strictEqual(grid.children.length, 3);

    // Delete first page (index 0)
    const rmBtn = grid.children[0].children.find(c => c.className === 'img-thumb-remove');
    rmBtn.click();

    assert.strictEqual(grid.children.length, 2);
    const countEl = mockDocument.getElementById('delete-file-count');
    assert.strictEqual(countEl.textContent, '2 pages');

    // First remaining card should now display Page 1
    const newFirstNum = grid.children[0].querySelector('.img-thumb-num');
    assert.strictEqual(newFirstNum.textContent, 1);
  });

  await t.test('prevents export when all pages are deleted and shows error toast', async () => {
    mockWindow['pdfjs-dist/build/pdf'] = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() })
          })
        })
      })
    };

    handleFiles([
      { name: 'single-page.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(16) }
    ]);
    await new Promise((r) => setTimeout(r, 10));

    const grid = mockDocument.getElementById('delete-preview-grid');
    assert.strictEqual(grid.children.length, 1);

    // Delete the only page
    const rmBtn = grid.children[0].children.find(c => c.className === 'img-thumb-remove');
    rmBtn.click();

    assert.strictEqual(grid.children.length, 0);

    await deleteBtnClick();
    assert.strictEqual(toastMessage, 'At least one page must remain in the PDF.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('deleting pages and downloading cleaned PDF works properly', async () => {
    mockWindow['pdfjs-dist/build/pdf'] = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 3,
          getPage: async (i) => ({
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() })
          })
        })
      })
    };

    let copyPagesArgs = [];
    mockWindow.PDFLib = {
      PDFDocument: {
        create: async () => ({
          copyPages: async (src, indices) => {
            copyPagesArgs = indices;
            return indices.map(i => ({ pageIndex: i }));
          },
          addPage: () => {},
          save: async () => new Uint8Array([1, 2, 3])
        }),
        load: async () => ({})
      }
    };

    const fakeFile = {
      name: 'report.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(16)
    };

    handleFiles([fakeFile]);
    await new Promise((r) => setTimeout(r, 10));

    const grid = mockDocument.getElementById('delete-preview-grid');
    assert.strictEqual(grid.children.length, 3);

    // Delete second page (original index 1)
    const secondCard = grid.children[1];
    const rmBtn = secondCard.children.find(c => c.className === 'img-thumb-remove');
    rmBtn.click();

    assert.strictEqual(grid.children.length, 2);

    // Click export button
    await deleteBtnClick();

    assert.deepStrictEqual(copyPagesArgs, [0, 2]);
    assert.strictEqual(toastMessage, 'PDF pages deleted successfully!');

    const resultsArea = mockDocument.getElementById('delete-results');
    assert.strictEqual(resultsArea.classList.contains('is-visible'), true);

    // Test download
    downloadBtnClick();
    assert.strictEqual(createdObjectUrl, 'blob:http://localhost/fake-url');
    assert.strictEqual(revokedObjectUrl, 'blob:http://localhost/fake-url');

    // Test reset
    resetBtnClick();
    assert.strictEqual(mockDocument.getElementById('delete-drop-zone').style.display, 'block');
    assert.strictEqual(grid.innerHTML, '');
  });

  await t.test('calls page.cleanup() and pdfDocument.destroy() properly', async () => {
    let pageCleanupCount = 0;
    let docDestroyCount = 0;

    mockWindow['pdfjs-dist/build/pdf'] = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          destroy: async () => { docDestroyCount++; },
          getPage: async () => ({
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() }),
            cleanup: () => { pageCleanupCount++; }
          })
        })
      })
    };

    const fakeFile = {
      name: 'cleanup-test.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(16)
    };

    handleFiles([fakeFile]);
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(pageCleanupCount, 2);

    resetDelete();
    assert.strictEqual(docDestroyCount, 1);
  });
});
