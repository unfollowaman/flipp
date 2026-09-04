const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/rearrange-pdf.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Strip ES module imports
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

// Append return statement to access internal functions for testing
src += '\nreturn { handleFiles, loadPdfAndRenderThumbnails, updatePagesOrder, resetRearrange };\n';

test('rearrange-pdf functionality', async (t) => {
  let rearrangeBtnClick;
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
        if (id === 'rearrange-btn' && event === 'click') rearrangeBtnClick = handler;
        if (id === 'rearrange-download-btn' && event === 'click') downloadBtnClick = handler;
        if (id === 'rearrange-reset-btn' && event === 'click') resetBtnClick = handler;
      },
      querySelector: (selector) => {
        if (selector === '.img-thumb-num') return children.find(c => c.className === 'img-thumb-num') || createMockElement('', 'div');
        if (selector === '.img-thumb-label') return children.find(c => c.className === 'img-thumb-label') || createMockElement('', 'div');
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
      getAttribute: () => null,
      setAttribute: () => {},
      removeAttribute: () => {}
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

  const wrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setProgress',
    'setupDragReorder',
    'Blob',
    'URL',
    'setTimeout',
    src
  );

  let handleFiles, loadPdfAndRenderThumbnails, updatePagesOrder, resetRearrange;

  t.beforeEach(() => {
    toastMessage = null;
    toastType = null;
    rearrangeBtnClick = undefined;
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
      MockBlob,
      mockURL,
      setTimeout
    );

    handleFiles = exportsObj.handleFiles;
    loadPdfAndRenderThumbnails = exportsObj.loadPdfAndRenderThumbnails;
    updatePagesOrder = exportsObj.updatePagesOrder;
    resetRearrange = exportsObj.resetRearrange;
  });

  await t.test('shows error toast when non-PDF file is selected', async () => {
    handleFiles([{ name: 'test.txt', type: 'text/plain' }]);
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

  await t.test('loads PDF and renders page thumbnail cards successfully', async () => {
    mockWindow['pdfjs-dist/build/pdf'] = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
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

    const grid = mockDocument.getElementById('rearrange-preview-grid');
    const countEl = mockDocument.getElementById('rearrange-file-count');
    const previewArea = mockDocument.getElementById('rearrange-preview-area');

    assert.strictEqual(grid.children.length, 2);
    assert.strictEqual(countEl.textContent, '2 pages');
    assert.strictEqual(previewArea.classList.contains('is-visible'), true);
    assert.strictEqual(setupDragReorderCalls.length, 2);
  });

  await t.test('shows error toast on rearrange click when PDFLib is unavailable', async () => {
    mockWindow.PDFLib = undefined;
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
      { name: 'test.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(16) }
    ]);
    await new Promise((r) => setTimeout(r, 10));

    await rearrangeBtnClick();
    assert.strictEqual(toastMessage, 'PDF library not ready yet.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('rearranging pages and triggering download works correctly', async () => {
    mockWindow['pdfjs-dist/build/pdf'] = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
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
      name: 'document.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(16)
    };

    handleFiles([fakeFile]);
    await new Promise((r) => setTimeout(r, 10));

    const grid = mockDocument.getElementById('rearrange-preview-grid');
    assert.strictEqual(grid.children.length, 2);

    // Click rearrange button
    await rearrangeBtnClick();

    assert.deepStrictEqual(copyPagesArgs, [0, 1]);
    assert.strictEqual(toastMessage, 'PDF rearranged successfully!');

    const resultsArea = mockDocument.getElementById('rearrange-results');
    assert.strictEqual(resultsArea.classList.contains('is-visible'), true);

    // Test download button
    downloadBtnClick();
    assert.strictEqual(createdObjectUrl, 'blob:http://localhost/fake-url');
    assert.strictEqual(revokedObjectUrl, 'blob:http://localhost/fake-url');

    // Test reset button
    resetBtnClick();
    assert.strictEqual(mockDocument.getElementById('rearrange-drop-zone').style.display, 'block');
    assert.strictEqual(grid.innerHTML, '');
  });

  await t.test('handles page removal and updates page order', async () => {
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
      name: 'multi.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(16)
    };

    handleFiles([fakeFile]);
    await new Promise((r) => setTimeout(r, 10));

    const grid = mockDocument.getElementById('rearrange-preview-grid');
    assert.strictEqual(grid.children.length, 3);

    // Remove middle page (index 1)
    const middleCard = grid.children[1];
    const rmBtn = middleCard.children.find(c => c.className === 'img-thumb-remove');
    rmBtn.click();

    assert.strictEqual(grid.children.length, 2);

    // Rearrange and verify copyPages receives updated indices [0, 2]
    await rearrangeBtnClick();
    assert.deepStrictEqual(copyPagesArgs, [0, 2]);
  });
});
