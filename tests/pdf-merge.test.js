const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-merge.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

test('pdf-merge functionality', async (t) => {
  let mockMergeClick;
  let addFilesCallback;
  let toastMessage = null;
  let toastType = null;
  let setupDragReorderCalls = [];

  const createMockElement = (id = '') => {
    const children = [];
    const eventListeners = {};
    const el = {
      id,
      value: '',
      style: { display: '', cssText: '' },
      dataset: {},
      children,
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      appendChild: (child) => {
        if (child && Array.isArray(child.children) && child.isFragment) {
          child.children.forEach((c) => {
            children.push(c);
            c.parentElement = el;
          });
          child.children.length = 0;
        } else {
          children.push(child);
          child.parentElement = el;
        }
      },
      innerHTML: '',
      textContent: '',
      addEventListener: (event, handler) => {
        eventListeners[event] = handler;
        if (id === 'merge-btn' && event === 'click') {
          mockMergeClick = handler;
        }
      },
      querySelector: (selector) => {
        if (selector === '.img-thumb-num') {
          return children.find(c => c.className === 'img-thumb-num') || createMockElement();
        }
        return createMockElement();
      },
      querySelectorAll: (selector) => {
        if (selector === '.img-thumb-card') {
          return children.filter(c => c.className === 'img-thumb-card');
        }
        return [];
      },
      getAttribute: () => null,
      setAttribute: () => {},
      removeAttribute: () => {},
      triggerEvent: (event, eData) => {
        if (eventListeners[event]) eventListeners[event](eData || { stopPropagation: () => {} });
      }
    };
    return el;
  };

  const elementMap = {};
  const mockDocument = {
    getElementById: (id) => {
      if (!elementMap[id]) elementMap[id] = createMockElement(id);
      return elementMap[id];
    },
    createElement: (tag) => createMockElement(tag),
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
  const mockInitDropZone = (dz, fi, cb) => {
    addFilesCallback = cb;
  };
  const mockShowToast = (msg, type) => {
    toastMessage = msg;
    toastType = type;
  };
  const mockSetupDragReorder = (card, onReorder) => {
    setupDragReorderCalls.push({ card, onReorder });
  };

  const wrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setupDragReorder',
    'Blob',
    'URL',
    src
  );

  t.beforeEach(() => {
    toastMessage = null;
    toastType = null;
    mockMergeClick = undefined;
    addFilesCallback = undefined;
    setupDragReorderCalls = [];
    for (const k in elementMap) delete elementMap[k];

    wrapper(
      mockDocument,
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetupDragReorder,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' }
    );
  });

  await t.test('shows error toast when less than 2 PDFs are added', async () => {
    await addFilesCallback([
      { type: 'application/pdf', name: '1.pdf', arrayBuffer: async () => new ArrayBuffer(0) }
    ]);
    await mockMergeClick();
    assert.strictEqual(toastMessage, 'Add at least 2 PDFs to merge.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('shows error toast when PDFLib is unavailable', async () => {
    await addFilesCallback([
      { type: 'application/pdf', name: '1.pdf', arrayBuffer: async () => new ArrayBuffer(0) },
      { type: 'application/pdf', name: '2.pdf', arrayBuffer: async () => new ArrayBuffer(0) }
    ]);
    mockWindow.PDFLib = undefined;
    await mockMergeClick();
    assert.strictEqual(toastMessage, 'PDF library not ready yet.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('renders thumbnail cards and registers drag reorder', async () => {
    await addFilesCallback([
      { type: 'application/pdf', name: 'doc1.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: 'doc2.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    const grid = mockDocument.getElementById('merge-file-grid');
    assert.strictEqual(grid.children.length, 2);
    assert.strictEqual(setupDragReorderCalls.length, 2);
  });

  await t.test('successfully merges multiple PDFs using Promise.all concurrent loading', async () => {
    let loadCount = 0;
    const mockPDFLib = {
      PDFDocument: {
        create: async () => ({
          copyPages: async (src, indices) => indices.map((i) => ({ index: i })),
          addPage: () => {},
          save: async () => new Uint8Array([1, 2, 3])
        }),
        load: async (bytes) => {
          loadCount++;
          return {
            getPageIndices: () => [0]
          };
        }
      }
    };
    mockWindow.PDFLib = mockPDFLib;

    await addFilesCallback([
      { type: 'application/pdf', name: '1.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: '2.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: '3.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    await mockMergeClick();

    assert.strictEqual(loadCount, 3);
    assert.strictEqual(toastMessage, 'Merged PDF is ready!');
  });
});
