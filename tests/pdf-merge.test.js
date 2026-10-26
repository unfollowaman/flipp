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

  const createMockElement = (id = '', className = '') => {
    const children = [];
    const eventListeners = {};
    const el = {
      id,
      className,
      value: '',
      disabled: false,
      title: '',
      style: { display: '', cssText: '' },
      dataset: {},
      children,
      classList: {
        add: (cls) => {
          if (!el.className.includes(cls)) el.className += ' ' + cls;
        },
        remove: (cls) => {
          el.className = el.className.replace(cls, '').trim();
        },
        contains: (cls) => el.className.includes(cls)
      },
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
        const findDescendant = (node) => {
          if (!node) return null;
          if (selector.startsWith('.') && node.className && node.className.includes(selector.slice(1))) {
            return node;
          }
          if (selector.startsWith('#') && node.id === selector.slice(1)) {
            return node;
          }
          if (Array.isArray(node.children)) {
            for (const child of node.children) {
              const found = findDescendant(child);
              if (found) return found;
            }
          }
          return null;
        };
        const res = findDescendant(el);
        return res || createMockElement();
      },
      querySelectorAll: (selector) => {
        const results = [];
        const findAll = (node) => {
          if (!node) return;
          if (selector.startsWith('.') && node.className && node.className.includes(selector.slice(1))) {
            results.push(node);
          }
          if (Array.isArray(node.children)) {
            for (const child of node.children) {
              findAll(child);
            }
          }
        };
        if (Array.isArray(el.children)) {
          for (const child of el.children) {
            findAll(child);
          }
        }
        return results;
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
    createElement: (tag, options) => createMockElement('', tag),
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

  const mockRenderPdfFirstPage = async () => {
    return 'data:image/png;base64,mockthumbnail';
  };

  const mockFileToDataUrl = async () => {
    return 'data:image/png;base64,mockimagedata';
  };

  const wrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setupDragReorder',
    'renderPdfFirstPage',
    'fileToDataUrl',
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
      mockRenderPdfFirstPage,
      mockFileToDataUrl,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' }
    );
  });

  await t.test('shows error toast when less than 2 PDFs are added and disables merge button', async () => {
    await addFilesCallback([
      { type: 'application/pdf', name: '1.pdf', arrayBuffer: async () => new ArrayBuffer(0) }
    ]);
    const mergeBtn = mockDocument.getElementById('merge-btn');
    assert.strictEqual(mergeBtn.disabled, true);

    await mockMergeClick();
    assert.strictEqual(toastMessage, 'Add at least 2 PDFs to merge.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('shows error toast when PDFLib is unavailable on merge execution', async () => {
    await addFilesCallback([
      { type: 'application/pdf', name: '1.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: '2.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);
    mockWindow.PDFLib = undefined;
    await mockMergeClick();
    assert.strictEqual(toastMessage, 'PDF library not ready yet.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('renders uploaded file cards along with persistent Add More Files card', async () => {
    await addFilesCallback([
      { type: 'application/pdf', name: 'doc1.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: 'doc2.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    const grid = mockDocument.getElementById('merge-file-grid');
    // 2 file cards + 1 persistent Add More Files card = 3 total children
    assert.strictEqual(grid.children.length, 3);
    assert.strictEqual(setupDragReorderCalls.length, 2);

    const addMoreCard = grid.children.find(c => c.className && c.className.includes('img-add-more-card'));
    assert.ok(addMoreCard, 'Add More Files card should exist in preview grid');
    const mergeBtn = mockDocument.getElementById('merge-btn');
    assert.strictEqual(mergeBtn.disabled, false);
  });

  await t.test('displays accurate page count for uploaded PDFs', async () => {
    mockWindow.PDFLib = {
      PDFDocument: {
        load: async () => ({
          getPageCount: () => 15,
          getPageIndices: () => Array.from({ length: 15 }, (_, i) => i)
        })
      }
    };

    await addFilesCallback([
      { type: 'application/pdf', name: 'math.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: 'single.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    const grid = mockDocument.getElementById('merge-file-grid');
    const fileCards = grid.children.filter(c => c.className && c.className.includes('img-thumb-card'));
    assert.strictEqual(fileCards.length, 2);

    const count1 = fileCards[0].querySelector('.img-thumb-page-count');
    assert.strictEqual(count1.textContent, '15 pages');
  });

  await t.test('enforces minimum 2 files upon file removal and restores valid state when added back', async () => {
    mockWindow.PDFLib = {
      PDFDocument: {
        load: async () => ({ getPageCount: () => 5 })
      }
    };

    await addFilesCallback([
      { type: 'application/pdf', name: 'doc1.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: 'doc2.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    const mergeBtn = mockDocument.getElementById('merge-btn');
    assert.strictEqual(mergeBtn.disabled, false);

    const grid = mockDocument.getElementById('merge-file-grid');
    const fileCards = grid.children.filter(c => c.className && c.className.includes('img-thumb-card'));
    const rmBtn = fileCards[0].querySelector('.img-thumb-remove');

    // Trigger removal of first file
    rmBtn.triggerEvent('click', { stopPropagation: () => {} });

    // After removing 1 file, 1 file remains + 1 Add More card -> mergeBtn disabled
    assert.strictEqual(mergeBtn.disabled, true);

    // Add another file
    await addFilesCallback([
      { type: 'application/pdf', name: 'doc3.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    // Now 2 files present -> mergeBtn restored to enabled
    assert.strictEqual(mergeBtn.disabled, false);
  });

  await t.test('handles invalid or corrupted PDFs gracefully without fabricated page count', async () => {
    mockWindow.PDFLib = {
      PDFDocument: {
        load: async () => {
          throw new Error('Corrupted PDF');
        }
      }
    };

    await addFilesCallback([
      { type: 'application/pdf', name: 'corrupt.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: 'valid.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    const grid = mockDocument.getElementById('merge-file-grid');
    const fileCards = grid.children.filter(c => c.className && c.className.includes('img-thumb-card'));
    const countEl = fileCards[0].querySelector('.img-thumb-page-count');
    assert.strictEqual(countEl.textContent, 'Invalid PDF');

    await mockMergeClick();
    assert.strictEqual(toastMessage, 'Please remove invalid or unreadable files before merging.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('supports image files alongside PDFs', async () => {
    mockWindow.PDFLib = {
      PDFDocument: {
        create: async () => ({
          embedPng: async () => ({ width: 100, height: 100 }),
          embedJpg: async () => ({ width: 100, height: 100 }),
          addPage: () => ({ drawImage: () => {} }),
          save: async () => new Uint8Array([1, 2, 3])
        }),
        load: async () => ({
          getPageCount: () => 1,
          getPageIndices: () => [0]
        })
      }
    };

    await addFilesCallback([
      { type: 'application/pdf', name: 'doc.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'image/png', name: 'photo.png', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    const grid = mockDocument.getElementById('merge-file-grid');
    const fileCards = grid.children.filter(c => c.className && c.className.includes('img-thumb-card'));
    assert.strictEqual(fileCards.length, 2);

    const count2 = fileCards[1].querySelector('.img-thumb-page-count');
    assert.strictEqual(count2.textContent, '1 page');
  });

  await t.test('successfully merges multiple PDFs using cached ArrayBuffer without re-reading file', async () => {
    let loadCount = 0;
    let arrayBufferReadCount = 0;
    let loadedBytesList = [];

    const mockPDFLib = {
      PDFDocument: {
        create: async () => ({
          copyPages: async (src, indices) => indices.map((i) => ({ index: i })),
          addPage: () => {},
          save: async () => new Uint8Array([1, 2, 3])
        }),
        load: async (bytes) => {
          loadCount++;
          loadedBytesList.push(bytes);
          return {
            getPageCount: () => 1,
            getPageIndices: () => [0]
          };
        }
      }
    };
    mockWindow.PDFLib = mockPDFLib;

    const mockBuf1 = new ArrayBuffer(8);
    const mockBuf2 = new ArrayBuffer(16);

    const mockFile1 = {
      type: 'application/pdf',
      name: '1.pdf',
      arrayBuffer: async () => {
        arrayBufferReadCount++;
        return mockBuf1;
      }
    };
    const mockFile2 = {
      type: 'application/pdf',
      name: '2.pdf',
      arrayBuffer: async () => {
        arrayBufferReadCount++;
        return mockBuf2;
      }
    };

    await addFilesCallback([mockFile1, mockFile2]);

    assert.strictEqual(arrayBufferReadCount, 2);

    await mockMergeClick();

    assert.strictEqual(loadCount, 4); // 2 loads during getPdfPageCount + 2 loads during merge
    assert.strictEqual(arrayBufferReadCount, 2);
    assert.strictEqual(toastMessage, 'Merged PDF is ready!');
  });

  await t.test('populates master preview with securely constructed img element upon merge', async () => {
    const mockPDFLib = {
      PDFDocument: {
        create: async () => ({
          copyPages: async (src, indices) => indices.map((i) => ({ index: i })),
          addPage: () => {},
          save: async () => new Uint8Array([1, 2, 3])
        }),
        load: async () => ({
          getPageCount: () => 1,
          getPageIndices: () => [0]
        })
      }
    };
    mockWindow.PDFLib = mockPDFLib;

    await addFilesCallback([
      { type: 'application/pdf', name: '1.pdf', arrayBuffer: async () => new ArrayBuffer(8) },
      { type: 'application/pdf', name: '2.pdf', arrayBuffer: async () => new ArrayBuffer(8) }
    ]);

    await mockMergeClick();

    const masterPreview = mockDocument.getElementById('merged-master-preview');
    assert.strictEqual(masterPreview.children.length, 1);
    const img = masterPreview.children[0];
    assert.strictEqual(img.src, 'data:image/png;base64,mockthumbnail');
    assert.strictEqual(img.alt, 'Merged PDF preview');
    assert.strictEqual(img.className, 'merged-master-img');
  });
});
