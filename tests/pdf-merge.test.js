const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-merge.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

test('pdf-merge error handling', async (t) => {
  let mockMergeClick;
  let addFilesCallback;
  let toastMessage = null;
  let toastType = null;

  const createMockElement = (id = '') => {
    const el = {
      id,
      value: '',
      style: { display: '' },
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      appendChild: () => {},
      innerHTML: '',
      textContent: '',
      addEventListener: (event, handler) => {
        if (id === 'merge-btn' && event === 'click') {
          mockMergeClick = handler;
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

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', src);

  t.beforeEach(() => {
    toastMessage = null;
    toastType = null;
    mockMergeClick = undefined;
    addFilesCallback = undefined;

    wrapper(
      mockDocument,
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' }
    );
  });

  await t.test('shows error toast when less than 2 PDFs are added', async () => {
    addFilesCallback([
      { type: 'application/pdf', name: '1.pdf', arrayBuffer: async () => new ArrayBuffer(0) }
    ]);
    await mockMergeClick();
    assert.strictEqual(toastMessage, 'Add at least 2 PDFs to merge.');
    assert.strictEqual(toastType, 'error');
  });

  await t.test('shows error toast when PDFLib is unavailable', async () => {
    addFilesCallback([
      { type: 'application/pdf', name: '1.pdf', arrayBuffer: async () => new ArrayBuffer(0) },
      { type: 'application/pdf', name: '2.pdf', arrayBuffer: async () => new ArrayBuffer(0) }
    ]);
    mockWindow.PDFLib = undefined;
    await mockMergeClick();
    assert.strictEqual(toastMessage, 'PDF library not ready yet.');
    assert.strictEqual(toastType, 'error');
  });
});
