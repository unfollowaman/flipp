const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-split.js');
let src = fs.readFileSync(srcPath, 'utf8');

src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

src += '\nreturn { loadPdfMetadataAndPreviews, renderPagePreview };\n';

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
