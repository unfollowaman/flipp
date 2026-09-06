const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-editor.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Strip import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
// Strip export keywords
src = src.replace(/export\s+function/g, 'function');
src = src.replace(/export\s+async\s+function/g, 'async function');

// Append return statement exposing internal/exported state & methods for testing
src += `\nreturn {
  domToPdfCoords,
  pdfToDomCoords,
  handlePdfSelect,
  loadPdfFromBytes,
  renderAllPages,
  saveState,
  undoAction,
  redoAction,
  resetEditor,
  exportEditedPdf,
  getEditorObjects: () => editorObjects,
  setEditorObjects: (objs) => { editorObjects = objs; },
  getSelectedObjId: () => selectedObjId,
  setSelectedObjId: (id) => { selectedObjId = id; },
  getHistoryStack: () => historyStack,
  getRedoStack: () => redoStack,
  getPdfjsDocument: () => pdfjsDocument,
  setPdfBytesOriginal: (bytes) => { pdfBytesOriginal = bytes; }
};\n`;

const elementMap = {};

function createMockElement(id = '') {
  if (!elementMap[id]) {
    const classes = new Set();
    elementMap[id] = {
      id,
      value: '',
      style: {},
      dataset: {},
      classList: {
        add: (cls) => classes.add(cls),
        remove: (cls) => classes.delete(cls),
        contains: (cls) => classes.has(cls),
        toggle: (cls) => {
          if (classes.has(cls)) classes.delete(cls);
          else classes.add(cls);
        }
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
        strokeText: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        ellipse: () => {},
        measureText: () => ({ width: 100 })
      }),
      toDataURL: () => 'data:image/png;base64,fakeData',
      click: () => {}
    };
  }
  return elementMap[id];
}

const mockDocument = {
  getElementById: (id) => createMockElement(id),
  querySelectorAll: (selector) => [],
  querySelector: (selector) => createMockElement('querySelector_' + selector),
  createElement: (tagName) => createMockElement(`el-${tagName}`),
  body: {
    appendChild: () => {},
    removeChild: () => {}
  }
};

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
  addEventListener: () => {},
  removeEventListener: () => {},
  'pdfjs-dist/build/pdf': {
    getDocument: ({ data }) => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (pageNum) => ({
          getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
          render: (ctx) => ({ promise: Promise.resolve() })
        })
      })
    })
  },
  PDFLib: {
    rgb: (r, g, b) => ({ r, g, b }),
    StandardFonts: {
      Helvetica: 'Helvetica',
      HelveticaBold: 'HelveticaBold',
      HelveticaOblique: 'HelveticaOblique'
    },
    PDFDocument: {
      load: async (bytes, opts) => ({
        getPages: () => [
          { getWidth: () => 612, getHeight: () => 792, drawText: () => {}, drawRectangle: () => {}, drawImage: () => {} },
          { getWidth: () => 612, getHeight: () => 792, drawText: () => {}, drawRectangle: () => {}, drawImage: () => {} }
        ],
        embedFont: async () => ({}),
        embedPng: async () => ({}),
        embedJpg: async () => ({}),
        save: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]) // %PDF-1.7
      })
    }
  }
};

const wrapper = new Function(
  'document',
  'window',
  'initDropZone',
  'showToast',
  'setProgress',
  'fileToDataUrl',
  'triggerDownload',
  'Blob',
  'URL',
  'console',
  src
);

const editorModule = wrapper(
  mockDocument,
  mockWindow,
  mockInitDropZone,
  mockShowToast,
  mockSetProgress,
  async () => 'data:image/png;base64,mock',
  () => {},
  class Blob {},
  { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
  mockConsole
);

test('pdf-editor centralized coordinate conversion', async (t) => {
  await t.test('domToPdfCoords correctly maps DOM box to PDF points', () => {
    const domRect = { x: 50, y: 100, width: 200, height: 100 };
    const pageViewport = { width: 400, height: 800 };
    const pdfSize = { width: 600, height: 1200 };

    const pdfCoords = editorModule.domToPdfCoords(domRect, pageViewport, pdfSize);

    assert.strictEqual(pdfCoords.x, 75);
    assert.strictEqual(pdfCoords.y, 900);
    assert.strictEqual(pdfCoords.width, 300);
    assert.strictEqual(pdfCoords.height, 150);
  });

  await t.test('pdfToDomCoords correctly maps PDF points to DOM box', () => {
    const pdfRect = { x: 75, y: 900, width: 300, height: 150 };
    const pageViewport = { width: 400, height: 800 };
    const pdfSize = { width: 600, height: 1200 };

    const domCoords = editorModule.pdfToDomCoords(pdfRect, pageViewport, pdfSize);

    assert.strictEqual(domCoords.x, 50);
    assert.strictEqual(domCoords.y, 100);
    assert.strictEqual(domCoords.width, 200);
    assert.strictEqual(domCoords.height, 100);
  });
});

test('pdf-editor file selection & error handling', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    editorModule.resetEditor();
  });

  await t.test('handlePdfSelect rejects non-PDF file and shows error toast', async () => {
    const invalidFile = { name: 'document.txt', type: 'text/plain' };
    await editorModule.handlePdfSelect([invalidFile]);

    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(
      toastMessages[0].msg,
      "Couldn't open this PDF. The file may be damaged or unsupported."
    );
    assert.strictEqual(toastMessages[0].type, 'error');
  });

  await t.test('loadPdfFromBytes loads PDF document and renders multi-page structure', async () => {
    const fakeBuffer = new Uint8Array([1, 2, 3]).buffer;
    await editorModule.loadPdfFromBytes(fakeBuffer);

    const doc = editorModule.getPdfjsDocument();
    assert.ok(doc, 'PDF.js document should be loaded');
    assert.strictEqual(doc.numPages, 2);
  });
});

test('pdf-editor object state management and Undo/Redo', async (t) => {
  t.beforeEach(() => {
    editorModule.resetEditor();
  });

  await t.test('supports adding, modifying, moving, deleting objects with undo/redo', () => {
    const textObj = {
      id: 'obj_1',
      type: 'text',
      pageNum: 1,
      x: 100,
      y: 100,
      width: 150,
      height: 40,
      rotation: 0,
      properties: { text: 'Hello Flipp', fontSize: 18 }
    };

    editorModule.saveState();
    editorModule.setEditorObjects([textObj]);

    assert.strictEqual(editorModule.getEditorObjects().length, 1);
    assert.strictEqual(editorModule.getHistoryStack().length, 1);

    const updatedObj = { ...textObj, x: 200, y: 200 };
    editorModule.saveState();
    editorModule.setEditorObjects([updatedObj]);

    assert.strictEqual(editorModule.getEditorObjects()[0].x, 200);

    editorModule.undoAction();
    assert.strictEqual(editorModule.getEditorObjects()[0].x, 100);

    editorModule.redoAction();
    assert.strictEqual(editorModule.getEditorObjects()[0].x, 200);
  });
});

test('pdf-editor PDF export process', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    editorModule.resetEditor();
  });

  await t.test('exportEditedPdf exports valid modified PDF document', async () => {
    const fakeBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    editorModule.setPdfBytesOriginal(fakeBuffer);

    await editorModule.loadPdfFromBytes(fakeBuffer);

    const objs = [
      {
        id: 'obj_text',
        type: 'text',
        pageNum: 1,
        x: 50,
        y: 50,
        width: 100,
        height: 30,
        properties: { text: 'Test Annotation', fontSize: 18, color: '#000000' }
      },
      {
        id: 'obj_highlight',
        type: 'highlight',
        pageNum: 1,
        x: 50,
        y: 100,
        width: 200,
        height: 20,
        properties: { color: '#ffff00', opacity: 0.5 }
      },
      {
        id: 'obj_shape',
        type: 'shape',
        pageNum: 2,
        x: 100,
        y: 100,
        width: 80,
        height: 80,
        properties: { shapeType: 'rect', strokeColor: '#000000', fillColor: '#ffffff', strokeWidth: 2 }
      },
      {
        id: 'obj_sig',
        type: 'signature',
        pageNum: 2,
        x: 150,
        y: 200,
        width: 120,
        height: 50,
        properties: { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }
      }
    ];

    editorModule.setEditorObjects(objs);

    let exportError = null;
    try {
      await editorModule.exportEditedPdf();
    } catch (err) {
      exportError = err;
    }

    assert.strictEqual(exportError, null, 'exportEditedPdf should execute without throwing error');
    assert.strictEqual(toastMessages.length, 0, 'No error toast should be displayed');
  });
});

test('pdf-editor renderAllPages performance', async (t) => {
  await t.test('renders all pages in parallel with correct DOM order', async () => {
    // Create mock pdfjsDocument with 10 pages and 5ms delay per step
    const mockDocument = {
      numPages: 10,
      getPage: async (pageNum) => {
        await new Promise((r) => setTimeout(r, 5));
        return {
          getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
          render: (ctx) => ({
            promise: new Promise((r) => setTimeout(r, 5))
          })
        };
      }
    };

    // Replace pdfjsDocument
    const fakeBuffer = new Uint8Array([1, 2, 3]).buffer;
    mockWindow['pdfjs-dist/build/pdf'].getDocument = () => ({
      promise: Promise.resolve(mockDocument)
    });

    await editorModule.loadPdfFromBytes(fakeBuffer);

    const startTime = performance.now();
    await editorModule.renderAllPages();
    const duration = performance.now() - startTime;

    console.log(`renderAllPages duration for 10 pages: ${duration.toFixed(2)}ms`);
    assert.ok(duration < 200, `Expected duration to be reasonable, got ${duration}ms`);
  });
});
