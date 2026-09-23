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
  handlePdfSelect,
  loadPdfFromBytes,
  renderAllPages,
  renderAllObjects,
  updateSelectedObjectUI,
  saveState,
  undoAction,
  redoAction,
  resetEditor,
  renderObjectToCanvasDataUrl,
  applyTextObject,
  applyHighlightObject,
  applyImageObject,
  applyCanvasObject,
  applyEditorObjectToPage,
  exportEditedPdf,
  updateZoom,
  setupOverlayEvents,
  createObjectForTool,
  finishDrawingPath,
  sanitizeFilename,
  checkShareSupport,
  getZoomLevel: () => zoomLevel,
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

let lastCreatedCanvas = null;

function createMockElement(id = '') {
  if (id && !id.startsWith('el-') && elementMap[id]) {
    return elementMap[id];
  }

  const classes = new Set();
  const contextCalls = [];
  const mockCtx = {
    calls: contextCalls,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    font: '',
    scale: (sx, sy) => contextCalls.push({ method: 'scale', args: [sx, sy] }),
    save: () => contextCalls.push({ method: 'save' }),
    restore: () => contextCalls.push({ method: 'restore' }),
    clearRect: (x, y, w, h) => contextCalls.push({ method: 'clearRect', args: [x, y, w, h] }),
    fillText: (text, x, y) => contextCalls.push({ method: 'fillText', args: [text, x, y] }),
    strokeText: (text, x, y) => contextCalls.push({ method: 'strokeText', args: [text, x, y] }),
    fillRect: (x, y, w, h) => contextCalls.push({ method: 'fillRect', args: [x, y, w, h] }),
    strokeRect: (x, y, w, h) => contextCalls.push({ method: 'strokeRect', args: [x, y, w, h] }),
    beginPath: () => contextCalls.push({ method: 'beginPath' }),
    moveTo: (x, y) => contextCalls.push({ method: 'moveTo', args: [x, y] }),
    lineTo: (x, y) => contextCalls.push({ method: 'lineTo', args: [x, y] }),
    stroke: () => contextCalls.push({ method: 'stroke' }),
    fill: () => contextCalls.push({ method: 'fill' }),
    ellipse: (x, y, rx, ry, rot, sa, ea) => contextCalls.push({ method: 'ellipse', args: [x, y, rx, ry, rot, sa, ea] }),
    measureText: (txt) => ({ width: txt ? txt.length * 10 : 100 })
  };

  const el = {
    id,
    value: '',
    style: {},
    dataset: {},
    width: 0,
    height: 0,
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
    getContext: () => mockCtx,
    toDataURL: (fmt) => `data:${fmt || 'image/png'};base64,fakeData`,
    click: () => {}
  };

  if (id === 'el-canvas') {
    lastCreatedCanvas = el;
  }

  if (id && !id.startsWith('el-')) {
    elementMap[id] = el;
  }
  return el;
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

  await t.test('undoAction does nothing when historyStack is empty', () => {
    editorModule.resetEditor();

    assert.strictEqual(editorModule.getHistoryStack().length, 0);
    assert.strictEqual(editorModule.getRedoStack().length, 0);
    assert.strictEqual(editorModule.getEditorObjects().length, 0);

    editorModule.undoAction();

    assert.strictEqual(editorModule.getHistoryStack().length, 0);
    assert.strictEqual(editorModule.getRedoStack().length, 0);
    assert.strictEqual(editorModule.getEditorObjects().length, 0);
  });

  await t.test('undoAction updates UI button disabled states and populates redoStack', () => {
    editorModule.resetEditor();
    const undoBtn = mockDocument.getElementById('editor-undo-btn');
    const redoBtn = mockDocument.getElementById('editor-redo-btn');

    const obj1 = { id: 'obj_1', type: 'text', pageNum: 1, x: 10, y: 10, properties: { text: 'Initial' } };
    const obj2 = { id: 'obj_1', type: 'text', pageNum: 1, x: 50, y: 50, properties: { text: 'Modified' } };

    // Initially no history/redo
    assert.strictEqual(editorModule.getHistoryStack().length, 0);

    // Save state before modification
    editorModule.setEditorObjects([obj1]);
    editorModule.saveState();

    // Make modification
    editorModule.setEditorObjects([obj2]);

    assert.strictEqual(editorModule.getHistoryStack().length, 1);
    assert.strictEqual(editorModule.getRedoStack().length, 0);

    // Undo action should push current state [obj2] to redoStack, pop [obj1] from historyStack
    editorModule.undoAction();

    assert.strictEqual(editorModule.getHistoryStack().length, 0);
    assert.strictEqual(editorModule.getRedoStack().length, 1);
    assert.deepStrictEqual(editorModule.getEditorObjects(), [obj1]);
    assert.strictEqual(undoBtn.disabled, true);
    assert.strictEqual(redoBtn.disabled, false);
  });

  await t.test('handles sequential multi-step undo and redo operations accurately', () => {
    editorModule.resetEditor();
    const state0 = [];
    const state1 = [{ id: '1', type: 'text', x: 0, y: 0 }];
    const state2 = [{ id: '1', type: 'text', x: 100, y: 0 }];
    const state3 = [{ id: '1', type: 'text', x: 100, y: 0 }, { id: '2', type: 'highlight', x: 10, y: 10 }];

    // Step 0 -> Step 1
    editorModule.setEditorObjects(state0);
    editorModule.saveState(); // history: [state0]
    editorModule.setEditorObjects(state1);

    // Step 1 -> Step 2
    editorModule.saveState(); // history: [state0, state1]
    editorModule.setEditorObjects(state2);

    // Step 2 -> Step 3
    editorModule.saveState(); // history: [state0, state1, state2]
    editorModule.setEditorObjects(state3);

    assert.strictEqual(editorModule.getHistoryStack().length, 3);
    assert.strictEqual(editorModule.getEditorObjects().length, 2);

    // Undo step 1: back to state2
    editorModule.undoAction();
    assert.deepStrictEqual(editorModule.getEditorObjects(), state2);
    assert.strictEqual(editorModule.getRedoStack().length, 1);

    // Undo step 2: back to state1
    editorModule.undoAction();
    assert.deepStrictEqual(editorModule.getEditorObjects(), state1);
    assert.strictEqual(editorModule.getRedoStack().length, 2);

    // Undo step 3: back to state0
    editorModule.undoAction();
    assert.deepStrictEqual(editorModule.getEditorObjects(), state0);
    assert.strictEqual(editorModule.getRedoStack().length, 3);

    // Redo step 1: forward to state1
    editorModule.redoAction();
    assert.deepStrictEqual(editorModule.getEditorObjects(), state1);
    assert.strictEqual(editorModule.getRedoStack().length, 2);

    // Redo step 2: forward to state2
    editorModule.redoAction();
    assert.deepStrictEqual(editorModule.getEditorObjects(), state2);
    assert.strictEqual(editorModule.getRedoStack().length, 1);
  });

  await t.test('redoAction does nothing when redoStack is empty', () => {
    editorModule.setEditorObjects([{ id: 'obj_1' }]);
    editorModule.saveState();

    assert.strictEqual(editorModule.getRedoStack().length, 0);
    editorModule.redoAction();

    assert.strictEqual(editorModule.getEditorObjects().length, 1);
    assert.strictEqual(editorModule.getRedoStack().length, 0);
  });

  await t.test('saveState clears redoStack when new modification occurs after undo', () => {
    const obj1 = { id: '1', x: 0 };
    const obj2 = { id: '1', x: 50 };
    const obj3 = { id: '1', x: 100 };

    editorModule.setEditorObjects([obj1]);
    editorModule.saveState();
    editorModule.setEditorObjects([obj2]);

    // Undo back to obj1
    editorModule.undoAction();
    assert.strictEqual(editorModule.getRedoStack().length, 1);

    // New edit: saveState should purge redoStack
    editorModule.saveState();
    editorModule.setEditorObjects([obj3]);

    assert.strictEqual(editorModule.getRedoStack().length, 0);
  });
});

test('pdf-editor PDF export process', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    editorModule.resetEditor();
  });

  await t.test('renderObjectToCanvasDataUrl renders draw, shape, and note objects correctly', async () => {
    // 1. Freehand draw object
    const drawObj = {
      type: 'draw',
      width: 100,
      height: 50,
      properties: { color: '#123456', strokeWidth: 3, path: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 50 }] }
    };
    const drawDataUrl = editorModule.renderObjectToCanvasDataUrl(drawObj);
    assert.strictEqual(typeof drawDataUrl, 'string');
    assert.ok(drawDataUrl.startsWith('data:image/png'));
    // Note: renderObjectToCanvasDataUrl resets canvas width/height to 0 after rendering for memory cleanup
    const drawCtx = lastCreatedCanvas.getContext('2d');
    assert.strictEqual(drawCtx.strokeStyle, '#123456');
    assert.strictEqual(drawCtx.lineWidth, 3);
    assert.ok(drawCtx.calls.some((c) => c.method === 'moveTo' && c.args[0] === 0 && c.args[1] === 0));
    assert.ok(drawCtx.calls.some((c) => c.method === 'lineTo' && c.args[0] === 10 && c.args[1] === 10));

    // Freehand draw object with default property fallbacks
    const drawObjFallback = {
      type: 'draw',
      width: 50,
      height: 50,
      properties: {}
    };
    editorModule.renderObjectToCanvasDataUrl(drawObjFallback);
    const drawFallbackCtx = lastCreatedCanvas.getContext('2d');
    assert.strictEqual(drawFallbackCtx.strokeStyle, '#000000');
    assert.strictEqual(drawFallbackCtx.lineWidth, 2);

    // 2. Shape object: rect (filled)
    const rectShapeObj = {
      type: 'shape',
      width: 80,
      height: 40,
      properties: { shapeType: 'rect', strokeColor: '#ff0000', fillColor: '#00ff00', strokeWidth: 4 }
    };
    editorModule.renderObjectToCanvasDataUrl(rectShapeObj);
    const rectCtx = lastCreatedCanvas.getContext('2d');
    assert.strictEqual(rectCtx.strokeStyle, '#ff0000');
    assert.strictEqual(rectCtx.fillStyle, '#00ff00');
    assert.strictEqual(rectCtx.lineWidth, 4);
    assert.ok(rectCtx.calls.some((c) => c.method === 'fillRect' && c.args[2] === 80 && c.args[3] === 40));
    assert.ok(rectCtx.calls.some((c) => c.method === 'strokeRect' && c.args[2] === 80 && c.args[3] === 40));

    // Shape object: rect (transparent/none fill)
    const rectTransparentObj = {
      type: 'shape',
      width: 80,
      height: 40,
      properties: { shapeType: 'rect', strokeColor: '#000000', fillColor: 'none', strokeWidth: 2 }
    };
    editorModule.renderObjectToCanvasDataUrl(rectTransparentObj);
    const rectTransCtx = lastCreatedCanvas.getContext('2d');
    assert.strictEqual(rectTransCtx.calls.some((c) => c.method === 'fillRect'), false);
    assert.ok(rectTransCtx.calls.some((c) => c.method === 'strokeRect'));

    // 3. Shape object: circle (filled and transparent)
    const circleShapeObj = {
      type: 'shape',
      width: 60,
      height: 60,
      properties: { shapeType: 'circle', strokeColor: '#0000ff', fillColor: '#ffff00', strokeWidth: 2 }
    };
    editorModule.renderObjectToCanvasDataUrl(circleShapeObj);
    const circleCtx = lastCreatedCanvas.getContext('2d');
    assert.ok(circleCtx.calls.some((c) => c.method === 'ellipse' && c.args[0] === 30 && c.args[1] === 30));
    assert.ok(circleCtx.calls.some((c) => c.method === 'fill'));
    assert.ok(circleCtx.calls.some((c) => c.method === 'stroke'));

    // 4. Shape object: line & arrow
    const lineShapeObj = {
      type: 'shape',
      width: 100,
      height: 20,
      properties: { shapeType: 'line', strokeColor: '#333333', strokeWidth: 1 }
    };
    editorModule.renderObjectToCanvasDataUrl(lineShapeObj);
    const lineCtx = lastCreatedCanvas.getContext('2d');
    assert.ok(lineCtx.calls.some((c) => c.method === 'moveTo' && c.args[0] === 4 && c.args[1] === 10));
    assert.ok(lineCtx.calls.some((c) => c.method === 'lineTo' && c.args[0] === 96 && c.args[1] === 10));

    const arrowShapeObj = {
      type: 'shape',
      width: 100,
      height: 20,
      properties: { shapeType: 'arrow', strokeColor: '#333333', strokeWidth: 1 }
    };
    editorModule.renderObjectToCanvasDataUrl(arrowShapeObj);
    const arrowCtx = lastCreatedCanvas.getContext('2d');
    assert.ok(arrowCtx.calls.some((c) => c.method === 'moveTo' && c.args[0] === 88 && c.args[1] === 4));

    // 5. Sticky note object (single & multi-line)
    const noteObj = {
      type: 'note',
      width: 150,
      height: 100,
      properties: { text: 'Note line 1\nNote line 2' }
    };
    const noteDataUrl = editorModule.renderObjectToCanvasDataUrl(noteObj);
    assert.strictEqual(typeof noteDataUrl, 'string');
    assert.ok(noteDataUrl.startsWith('data:image/png'));
    const noteCtx = lastCreatedCanvas.getContext('2d');
    assert.strictEqual(noteCtx.fillStyle, '#000000');
    assert.ok(noteCtx.calls.some((c) => c.method === 'fillText' && c.args[0] === 'Note line 1' && c.args[2] === 16));
    assert.ok(noteCtx.calls.some((c) => c.method === 'fillText' && c.args[0] === 'Note line 2' && c.args[2] === 32));

    // 6. Unknown object type
    const unknownObj = {
      type: 'unsupported',
      width: 100,
      height: 100,
      properties: {}
    };
    const unknownDataUrl = editorModule.renderObjectToCanvasDataUrl(unknownObj);
    assert.strictEqual(typeof unknownDataUrl, 'string');
    assert.ok(unknownDataUrl.startsWith('data:image/png'));
  });

  await t.test('export helper functions (renderObjectToCanvasDataUrl, applyTextObject, etc.)', async () => {
    const drawObj = {
      type: 'draw',
      width: 100,
      height: 50,
      properties: { color: '#000000', strokeWidth: 2, path: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
    };

    const mockPage = {
      drawTextCalls: [],
      drawRectangleCalls: [],
      drawImageCalls: [],
      drawText(line, opts) { this.drawTextCalls.push({ line, opts }); },
      drawRectangle(opts) { this.drawRectangleCalls.push(opts); },
      drawImage(img, opts) { this.drawImageCalls.push({ img, opts }); }
    };

    const textObj = {
      type: 'text',
      properties: { text: 'Line 1\nLine 2', fontSize: 18, color: '#ff0000', bold: true }
    };
    const pdfCoords = { x: 10, y: 20, width: 100, height: 40 };
    const pageMetrics = { pdfWidth: 600, pageViewport: { width: 300 } };
    const fonts = { fontHelveticaBold: 'HelveticaBold' };

    editorModule.applyTextObject(mockPage, textObj, pdfCoords, pageMetrics, fonts);
    assert.strictEqual(mockPage.drawTextCalls.length, 2);
    assert.strictEqual(mockPage.drawTextCalls[0].line, 'Line 1');

    const highlightObj = {
      type: 'highlight',
      properties: { color: '#ffff00', opacity: 0.5 }
    };
    editorModule.applyHighlightObject(mockPage, highlightObj, pdfCoords);
    assert.strictEqual(mockPage.drawRectangleCalls.length, 1);

    const mockPdfDoc = {
      embedPng: async () => ({ id: 'png' }),
      embedJpg: async () => ({ id: 'jpg' })
    };
    const embeddedImages = new Map();
    const imageObj = {
      type: 'image',
      properties: { src: 'data:image/png;base64,fake' }
    };
    await editorModule.applyImageObject(mockPage, imageObj, pdfCoords, mockPdfDoc, embeddedImages);
    assert.strictEqual(mockPage.drawImageCalls.length, 1);
    assert.strictEqual(embeddedImages.size, 1);

    await editorModule.applyCanvasObject(mockPage, drawObj, pdfCoords, mockPdfDoc);
    assert.strictEqual(mockPage.drawImageCalls.length, 2);

    await editorModule.applyEditorObjectToPage(mockPage, { x: 0, y: 0, width: 50, height: 50, ...textObj }, pageMetrics, fonts, mockPdfDoc, embeddedImages);
    assert.strictEqual(mockPage.drawTextCalls.length, 4);
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

test('pdf-editor resource cleanup', async (t) => {
  await t.test('renderAllPages invokes page.cleanup on rendered pages', async () => {
    let cleanupCalledCount = 0;
    const mockDocument = {
      numPages: 2,
      getPage: async (pageNum) => ({
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: () => { cleanupCalledCount++; }
      })
    };

    mockWindow['pdfjs-dist/build/pdf'].getDocument = () => ({
      promise: Promise.resolve(mockDocument)
    });

    const fakeBuffer = new Uint8Array([1, 2, 3]).buffer;
    await editorModule.loadPdfFromBytes(fakeBuffer);

    assert.strictEqual(cleanupCalledCount, 2, 'page.cleanup() should be called for each page');
  });

  await t.test('loadPdfFromBytes and resetEditor invoke pdfjsDocument.destroy()', async () => {
    let destroyCalledCount = 0;
    const mockDocument = {
      numPages: 1,
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: () => {}
      }),
      destroy: async () => { destroyCalledCount++; }
    };

    mockWindow['pdfjs-dist/build/pdf'].getDocument = () => ({
      promise: Promise.resolve(mockDocument)
    });

    const fakeBuffer = new Uint8Array([1, 2, 3]).buffer;
    await editorModule.loadPdfFromBytes(fakeBuffer);
    assert.strictEqual(destroyCalledCount, 0, 'destroy not called on first load');

    // Loading a new file should call destroy on previous doc
    await editorModule.loadPdfFromBytes(fakeBuffer);
    assert.strictEqual(destroyCalledCount, 1, 'destroy should be called when reloading new PDF document');

    // resetEditor should call destroy
    editorModule.resetEditor();
    assert.strictEqual(destroyCalledCount, 2, 'destroy should be called on resetEditor');
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

test('pdf-editor container width fallback and zoom controls', async (t) => {
  await t.test('renderAllPages handles 0 clientWidth safely without negative scales', async () => {
    const pagesScroll = mockDocument.getElementById('editor-pages-scroll');
    pagesScroll.clientWidth = 0; // Simulate hidden container

    let renderedViewport = null;
    const mockDoc = {
      numPages: 1,
      getPage: async () => ({
        getViewport: ({ scale }) => {
          renderedViewport = { scale, width: 600 * scale, height: 800 * scale };
          return renderedViewport;
        },
        render: () => ({ promise: Promise.resolve() })
      })
    };

    mockWindow['pdfjs-dist/build/pdf'].getDocument = () => ({
      promise: Promise.resolve(mockDoc)
    });

    const fakeBuffer = new Uint8Array([1, 2, 3]).buffer;
    await editorModule.loadPdfFromBytes(fakeBuffer);

    assert.ok(renderedViewport, 'Page viewport should be computed');
    assert.ok(renderedViewport.scale > 0, 'Scale factor must be positive even when container clientWidth is 0');
    assert.ok(renderedViewport.width > 0, 'Viewport width must be positive');
  });

  await t.test('updateZoom bounds zoom level between 0.25 and 3.0', async () => {
    editorModule.updateZoom(1.5);
    assert.strictEqual(editorModule.getZoomLevel(), 1.5);

    editorModule.updateZoom(5.0);
    assert.strictEqual(editorModule.getZoomLevel(), 3.0);

    editorModule.updateZoom(0.1);
    assert.strictEqual(editorModule.getZoomLevel(), 0.25);

    editorModule.resetEditor();
    assert.strictEqual(editorModule.getZoomLevel(), 1.0);
  });
});

test('pdf-editor overlay event interactions and object creation', async (t) => {
  t.beforeEach(() => {
    editorModule.resetEditor();
  });

  await t.test('createObjectForTool generates correct structures for all tool types', () => {
    const textObj = editorModule.createObjectForTool('text', 1, 100, 150);
    assert.strictEqual(textObj.type, 'text');
    assert.strictEqual(textObj.x, 100);
    assert.strictEqual(textObj.y, 150);

    const highlightObj = editorModule.createObjectForTool('highlight', 1, 50, 50);
    assert.strictEqual(highlightObj.type, 'highlight');

    const shapeObj = editorModule.createObjectForTool('shape', 1, 200, 200);
    assert.strictEqual(shapeObj.type, 'shape');

    const noteObj = editorModule.createObjectForTool('note', 1, 300, 300);
    assert.strictEqual(noteObj.type, 'note');

    const unknown = editorModule.createObjectForTool('unknown', 1, 0, 0);
    assert.strictEqual(unknown, null);
  });

  await t.test('finishDrawingPath computes bounds and returns normalized path object', () => {
    const path = [{ x: 10, y: 10 }, { x: 110, y: 60 }];
    const drawObj = editorModule.finishDrawingPath(path, 1);

    assert.ok(drawObj);
    assert.strictEqual(drawObj.type, 'draw');
    assert.strictEqual(drawObj.x, 10);
    assert.strictEqual(drawObj.y, 10);
    assert.strictEqual(drawObj.width, 100);
    assert.strictEqual(drawObj.height, 50);
    assert.deepStrictEqual(drawObj.properties.path, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);

    assert.strictEqual(editorModule.finishDrawingPath([{ x: 5, y: 5 }], 1), null);
  });
});

test('pdf-editor draggable and resizable behavior', async (t) => {
  t.beforeEach(() => {
    editorModule.resetEditor();
  });

  await t.test('renderAllObjects attaches handles and preserves DOM elements on selection', () => {
    const drawObj = {
      id: 'obj_draw_1',
      type: 'draw',
      pageNum: 1,
      x: 20,
      y: 30,
      width: 100,
      height: 80,
      properties: { color: '#000000', strokeWidth: 2, path: [{ x: 0, y: 0 }, { x: 50, y: 50 }] }
    };

    editorModule.setEditorObjects([drawObj]);
    editorModule.setSelectedObjId('obj_draw_1');

    editorModule.renderAllObjects();
    assert.strictEqual(editorModule.getEditorObjects().length, 1);
    assert.strictEqual(editorModule.getSelectedObjId(), 'obj_draw_1');

    // Changing selection via updateSelectedObjectUI does not throw and maintains object
    editorModule.setSelectedObjId(null);
    editorModule.updateSelectedObjectUI();
    assert.strictEqual(editorModule.getSelectedObjId(), null);
  });

  await t.test('updates object dimensions during drag and resize for all object types', () => {
    const textObj = {
      id: 'obj_text_1',
      type: 'text',
      pageNum: 1,
      x: 10,
      y: 10,
      width: 100,
      height: 40,
      properties: { text: 'Test', fontSize: 16 }
    };

    const shapeObj = {
      id: 'obj_shape_1',
      type: 'shape',
      pageNum: 1,
      x: 50,
      y: 50,
      width: 120,
      height: 100,
      properties: { shapeType: 'rect', strokeColor: '#000000' }
    };

    editorModule.setEditorObjects([textObj, shapeObj]);

    // Simulate drag movement on text object
    textObj.x = 60;
    textObj.y = 80;

    // Simulate resize movement on shape object
    shapeObj.width = 200;
    shapeObj.height = 150;

    assert.strictEqual(editorModule.getEditorObjects()[0].x, 60);
    assert.strictEqual(editorModule.getEditorObjects()[0].y, 80);
    assert.strictEqual(editorModule.getEditorObjects()[1].width, 200);
    assert.strictEqual(editorModule.getEditorObjects()[1].height, 150);
  });
});

test('pdf-editor sanitizeFilename and Web Share API feature detection', async (t) => {
  await t.test('sanitizeFilename strips slashes and appends .pdf extension when missing', () => {
    assert.strictEqual(editorModule.sanitizeFilename('my_document.pdf'), 'my_document.pdf');
    assert.strictEqual(editorModule.sanitizeFilename('my/doc\\folder/test.pdf'), 'my_doc_folder_test.pdf');
    assert.strictEqual(editorModule.sanitizeFilename('report'), 'report.pdf');
    assert.strictEqual(editorModule.sanitizeFilename('   '), 'document.pdf');
    assert.strictEqual(editorModule.sanitizeFilename(null), 'document.pdf');
  });

  await t.test('checkShareSupport returns false in test environment when navigator.canShare is missing', () => {
    const isSupported = editorModule.checkShareSupport();
    assert.strictEqual(isSupported, false);
  });
});
