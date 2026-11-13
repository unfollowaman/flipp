const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/sign-pdf.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Strip import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
// Strip export keywords if present
src = src.replace(/export\s+function/g, 'function');

// Append return statement exposing internal variables and functions for testing
src += '\nreturn { renderPage, handlePdfSelect, handleImageSelect, resetTool, createSignatureOverlay, makeDraggableAndResizable, getPdfSignaturePlacement, updateOverlayPixelPosition, getSignatures, syncActiveOverlays, getPdfjsDocument: () => pdfjsDocument, setPdfjsDocument: (doc) => { pdfjsDocument = doc; }, setNumPages: (n) => { numPages = n; }, setCurrentPage: (p) => { currentPage = p; }, setPdfBytesOriginal: (b) => { pdfBytesOriginal = b; }, getPdfBytesOriginal: () => pdfBytesOriginal };\n';

const elementMap = {};

function createMockElement(id = '') {
  if (!elementMap[id]) {
    const classes = new Set();
    const attrs = {};
    const listeners = {};
    elementMap[id] = {
      id,
      value: '',
      style: {},
      dataset: {},
      attributes: attrs,
      setAttribute: (attr, val) => { attrs[attr] = String(val); },
      getAttribute: (attr) => attrs[attr] || null,
      removeAttribute: (attr) => { delete attrs[attr]; },
      classList: {
        add: (cls) => classes.add(cls),
        remove: (cls) => classes.delete(cls),
        contains: (cls) => classes.has(cls)
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
      scrollIntoView: () => {},
      addEventListener: (type, fn) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      removeEventListener: (type, fn) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((l) => l !== fn);
        }
      },
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      getContext: () => ({
        scale: () => {},
        clearRect: () => {},
        fillText: () => {},
        measureText: () => ({ width: 100 })
      }),
      toDataURL: () => 'data:image/png;base64,fake',
      click: () => {
        if (listeners['click']) {
          listeners['click'].forEach((fn) => fn({ type: 'click', target: elementMap[id], preventDefault: () => {}, stopPropagation: () => {} }));
        }
      }
    };
  }
  return elementMap[id];
}

const docEventListeners = {};
const mockDocument = {
  getElementById: (id) => createMockElement(id),
  querySelectorAll: (selector) => [],
  createElement: (tagName) => createMockElement(`el-${tagName}`),
  addEventListener: (type, fn) => {
    if (!docEventListeners[type]) docEventListeners[type] = [];
    docEventListeners[type].push(fn);
  },
  removeEventListener: (type, fn) => {
    if (docEventListeners[type]) {
      docEventListeners[type] = docEventListeners[type].filter((l) => l !== fn);
    }
  },
  body: {
    appendChild: () => {},
    removeChild: () => {}
  }
};

class MockMutationObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
}

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
let activatedPills = [];
const mockActivatePill = (group, value) => {
  activatedPills.push({ group, value });
};

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
  MutationObserver: MockMutationObserver,
  'pdfjs-dist/build/pdf': {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async () => ({
          getViewport: () => ({ width: 800, height: 600 }),
          render: () => ({ promise: Promise.resolve() })
        })
      })
    })
  },
  PDFLib: {
    degrees: (angle) => ({ type: 'degrees', angle }),
    PDFDocument: {
      load: async () => ({
        getPages: () => [{
          getWidth: () => 612,
          getHeight: () => 792,
          getRotation: () => ({ type: 'degrees', angle: 0 }),
          getX: () => 0,
          getY: () => 0,
          drawImage: () => {}
        }],
        embedPng: async () => ({}),
        embedJpg: async () => ({}),
        save: async () => new Uint8Array([1, 2, 3])
      })
    }
  }
};

global.MutationObserver = MockMutationObserver;

const wrapper = new Function(
  'document',
  'window',
  'initDropZone',
  'showToast',
  'setProgress',
  'activatePill',
  'Blob',
  'URL',
  'console',
  'MutationObserver',
  src
);

const {
  renderPage,
  handlePdfSelect,
  handleImageSelect,
  resetTool,
  createSignatureOverlay,
  makeDraggableAndResizable,
  getPdfSignaturePlacement,
  updateOverlayPixelPosition,
  getSignatures,
  syncActiveOverlays,
  getPdfjsDocument,
  setPdfjsDocument,
  setNumPages,
  setCurrentPage,
  setPdfBytesOriginal,
  getPdfBytesOriginal
} = wrapper(
  mockDocument,
  mockWindow,
  mockInitDropZone,
  mockShowToast,
  mockSetProgress,
  mockActivatePill,
  class Blob {},
  { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
  mockConsole,
  MockMutationObserver
);

test('sign-pdf renderPage error paths and happy paths', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    consoleErrors = [];
    setNumPages(3);
    setCurrentPage(1);
    elementMap['sign-loading-overlay'].style.display = 'none';
  });

  await t.test('renderPage displays error toast and hides loading overlay when getPage fails', async () => {
    const errorMsg = 'Failed to load page 1';
    setPdfjsDocument({
      getPage: async (pageNum) => {
        throw new Error(errorMsg);
      }
    });

    await renderPage(1);

    // Verify toast was shown with correct message and type
    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Error rendering page preview.');
    assert.strictEqual(toastMessages[0].type, 'error');

    // Verify loading overlay is hidden in finally block
    assert.strictEqual(elementMap['sign-loading-overlay'].style.display, 'none');
  });

  await t.test('renderPage displays error toast and hides loading overlay when page.render fails', async () => {
    const renderError = 'Canvas render failed';
    setPdfjsDocument({
      getPage: async (pageNum) => ({
        getViewport: ({ scale }) => ({ width: 800 * scale, height: 600 * scale }),
        render: (ctx) => ({
          promise: Promise.reject(new Error(renderError))
        })
      })
    });

    await renderPage(1);

    // Verify toast was shown with correct message and type
    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Error rendering page preview.');
    assert.strictEqual(toastMessages[0].type, 'error');

    // Verify loading overlay is hidden in finally block
    assert.strictEqual(elementMap['sign-loading-overlay'].style.display, 'none');
  });

  await t.test('renderPage updates canvas dimensions and page info on success and calls page.cleanup()', async () => {
    let renderCalled = false;
    let cleanupCalled = false;
    setPdfjsDocument({
      getPage: async (pageNum) => ({
        getViewport: ({ scale }) => ({ width: 800 * scale, height: 600 * scale }),
        render: (ctx) => {
          renderCalled = true;
          return { promise: Promise.resolve() };
        },
        cleanup: () => {
          cleanupCalled = true;
        }
      })
    });

    await renderPage(2);

    assert.strictEqual(renderCalled, true);
    assert.strictEqual(cleanupCalled, true);
    assert.strictEqual(elementMap['sign-page-info'].textContent, 'Page 2 of 3');
    assert.strictEqual(elementMap['sign-preview-canvas'].width, 800);
    assert.strictEqual(elementMap['sign-preview-canvas'].height, 600);
    assert.strictEqual(elementMap['sign-loading-overlay'].style.display, 'none');
    assert.strictEqual(toastMessages.length, 0);
  });
});

test('sign-pdf resource cleanup on reset and reload', async (t) => {
  await t.test('resetTool calls destroy on existing pdfjsDocument', async () => {
    let destroyCalled = false;
    setPdfjsDocument({
      destroy: () => {
        destroyCalled = true;
      }
    });

    resetTool();

    assert.strictEqual(destroyCalled, true);
    assert.strictEqual(getPdfjsDocument(), null);
  });

  await t.test('handlePdfSelect destroys existing pdfjsDocument before loading new one', async () => {
    let destroyCalled = false;
    setPdfjsDocument({
      destroy: async () => {
        destroyCalled = true;
      }
    });

    const file = {
      name: 'test.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(8)
    };

    await handlePdfSelect([file]);

    assert.strictEqual(destroyCalled, true);
  });
});

test('sign-pdf file selection error paths', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    consoleErrors = [];
  });

  await t.test('handlePdfSelect rejects non-pdf file and shows toast', async () => {
    const invalidFile = { name: 'document.docx', type: 'application/msword' };
    await handlePdfSelect([invalidFile]);

    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Please select a valid PDF file.');
    assert.strictEqual(toastMessages[0].type, 'error');
  });

  await t.test('handleImageSelect rejects non-image file and shows toast', async () => {
    const invalidFile = { name: 'document.pdf', type: 'application/pdf' };
    await handleImageSelect([invalidFile]);

    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Please upload a valid image file (PNG/JPG).');
    assert.strictEqual(toastMessages[0].type, 'error');
  });
});

test('sign-pdf createSignatureOverlay', async (t) => {
  await t.test('createSignatureOverlay sets delete handle textContent correctly', () => {
    const appendedElements = [];
    elementMap['sign-canvas-container'].appendChild = (child) => {
      appendedElements.push(child);
    };

    const createdElements = [];
    let elemIdSeq = 0;
    const origCreateElement = mockDocument.createElement;
    mockDocument.createElement = (tagName) => {
      const el = createMockElement(`temp-el-${elemIdSeq++}`);
      createdElements.push(el);
      return el;
    };

    createSignatureOverlay('data:image/png;base64,sample');

    const deleteBtn = createdElements.find((el) => el.className === 'delete-handle');
    assert.ok(deleteBtn, 'Delete handle should be created');
    assert.strictEqual(deleteBtn.textContent, '✕');
    assert.strictEqual(deleteBtn.innerHTML, '');

    const resizeBtn = createdElements.find((el) => el.className === 'resize-handle');
    assert.ok(resizeBtn, 'Resize handle should be created');

    mockDocument.createElement = origCreateElement;
  });

  await t.test('createSignatureOverlay sets accessibility attributes on delete and resize handles', () => {
    const origCreateElement = mockDocument.createElement;
    const createdElements = [];
    let elemIdSeq = 100;
    mockDocument.createElement = (tagName) => {
      const el = createMockElement(`temp-el-${elemIdSeq++}`);
      createdElements.push(el);
      return el;
    };

    createSignatureOverlay('data:image/png;base64,sample');

    const deleteBtn = createdElements.find((el) => el.className === 'delete-handle');
    assert.ok(deleteBtn, 'Delete button element should exist');
    assert.strictEqual(deleteBtn.getAttribute('role'), 'button');
    assert.strictEqual(deleteBtn.getAttribute('tabindex'), '0');
    assert.strictEqual(deleteBtn.getAttribute('aria-label'), 'Remove signature');
    assert.strictEqual(deleteBtn.getAttribute('title'), 'Remove signature');

    const resizeHandle = createdElements.find((el) => el.className === 'resize-handle');
    assert.ok(resizeHandle, 'Resize handle element should exist');
    assert.strictEqual(resizeHandle.getAttribute('aria-label'), 'Resize signature');
    assert.strictEqual(resizeHandle.getAttribute('title'), 'Resize signature');

    mockDocument.createElement = origCreateElement;
  });
});

test('sign-pdf signature overlay selection and deselection', async (t) => {
  let docListeners = {};
  const activeOverlays = [];

  const localDoc = {
    getElementById: (id) => createMockElement(id),
    querySelectorAll: (selector) => {
      if (selector === ".signature-overlay") return activeOverlays;
      if (selector === ".signature-overlay.selected") {
        return activeOverlays.filter((o) => o.classList.contains("selected"));
      }
      return [];
    },
    createElement: (tagName) => {
      const el = createMockElement(`el-${tagName}`);
      return el;
    },
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter((l) => l !== fn);
      }
    },
    body: { appendChild: () => {}, removeChild: () => {} }
  };

  const localWrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setProgress',
    'activatePill',
    'Blob',
    'URL',
    'console',
    'MutationObserver',
    src
  );

  const localSignPdf = localWrapper(
    localDoc,
    mockWindow,
    mockInitDropZone,
    mockShowToast,
    mockSetProgress,
    mockActivatePill,
    class Blob {},
    { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    mockConsole,
    MockMutationObserver
  );

  await t.test('newly created signature overlay is selected by default', () => {
    activeOverlays.length = 0;
    const createdElements = [];

    localDoc.createElement = (tagName) => {
      const el = createMockElement(`sig-elem-${createdElements.length}`);
      createdElements.push(el);
      return el;
    };

    localSignPdf.createSignatureOverlay('data:image/png;base64,sample');
    const overlay = createdElements[0]; // first element created in createSignatureOverlay is the overlay div
    assert.ok(overlay, 'Overlay created');
    assert.strictEqual(overlay.classList.contains('selected'), true, 'Overlay should be selected when created');
    activeOverlays.push(overlay);
  });

  await t.test('clicking outside deselects selected signature overlay when overlay exists', () => {
    assert.ok(docListeners['click'] && docListeners['click'].length > 0, 'Document click listener registered');
    assert.strictEqual(activeOverlays[0].classList.contains('selected'), true);

    // Simulate click outside
    const clickOutsideEvent = {
      target: {
        closest: (sel) => null
      }
    };
    docListeners['click'][0](clickOutsideEvent);

    assert.strictEqual(activeOverlays[0].classList.contains('selected'), false, 'Overlay should be deselected after clicking outside');
  });

  await t.test('clicking on a signature overlay selects it and deselects others', () => {
    const overlay1 = activeOverlays[0];
    const overlay2 = createMockElement('sig-overlay-2');
    overlay2.classList.add('selected');
    activeOverlays.push(overlay2);

    assert.strictEqual(overlay1.classList.contains('selected'), false);
    assert.strictEqual(overlay2.classList.contains('selected'), true);

    // Simulate clicking on overlay1
    const clickOverlay1Event = {
      target: {
        closest: (sel) => sel === '.signature-overlay' ? overlay1 : null
      }
    };

    // Overlay mousedown handler selects overlay1
    overlay1.classList.add('selected');
    overlay2.classList.remove('selected');

    // Document click handler should keep overlay1 selected
    docListeners['click'][0](clickOverlay1Event);

    assert.strictEqual(overlay1.classList.contains('selected'), true);
    assert.strictEqual(overlay2.classList.contains('selected'), false);
  });
});

test('sign-pdf makeDraggableAndResizable interactions', async (t) => {
  let docListeners = {};
  const mockDoc = {
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter((l) => l !== fn);
      }
    }
  };

  const localWrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setProgress',
    'activatePill',
    'Blob',
    'URL',
    'console',
    'MutationObserver',
    src
  );

  const localSignPdf = localWrapper(
    mockDocument,
    mockWindow,
    mockInitDropZone,
    mockShowToast,
    mockSetProgress,
    mockActivatePill,
    class Blob {},
    { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    mockConsole,
    MockMutationObserver
  );

  await t.test('makeDraggableAndResizable attaches drag event listeners and moves overlay correctly', () => {
    docListeners = {};
    const overlayListeners = {};
    const overlay = {
      style: { left: '10px', top: '20px', width: '100px', height: '50px' },
      offsetWidth: 100,
      offsetHeight: 50,
      classList: { contains: () => false },
      addEventListener: (type, fn) => {
        overlayListeners[type] = fn;
      }
    };
    const resizeHandle = {
      addEventListener: () => {}
    };

    localSignPdf.makeDraggableAndResizable(overlay, resizeHandle);

    assert.ok(overlayListeners['mousedown'], 'Overlay should have mousedown listener');

    // Simulate start drag
    const startEvent = {
      type: 'mousedown',
      clientX: 100,
      clientY: 100,
      target: overlay
    };

    // Replace global document in wrapper execution context context via node standard global mock or docListeners inspection
    // Note that drag uses global `document` in sign-pdf.js, which maps to mockDocument in wrapper scope.
    // Let's attach addEventListener on mockDocument.
    const origDocAddListener = mockDocument.addEventListener;
    const origDocRemoveListener = mockDocument.removeEventListener;
    mockDocument.addEventListener = (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    };
    mockDocument.removeEventListener = (type, fn) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter((l) => l !== fn);
      }
    };

    overlayListeners['mousedown'](startEvent);

    assert.ok(docListeners['mousemove'] && docListeners['mousemove'].length > 0, 'mousemove listener registered');
    assert.ok(docListeners['mouseup'] && docListeners['mouseup'].length > 0, 'mouseup listener registered');

    // Simulate drag mousemove
    const moveEvent = {
      type: 'mousemove',
      clientX: 150,
      clientY: 130
    };
    docListeners['mousemove'][0](moveEvent);

    assert.strictEqual(overlay.style.left, '60px'); // 10 + (150 - 100) = 60
    assert.strictEqual(overlay.style.top, '50px');  // 20 + (130 - 100) = 50

    // Simulate end drag
    docListeners['mouseup'][0]({ type: 'mouseup' });

    assert.strictEqual(docListeners['mousemove'].length, 0);
    assert.strictEqual(docListeners['mouseup'].length, 0);

    mockDocument.addEventListener = origDocAddListener;
    mockDocument.removeEventListener = origDocRemoveListener;
  });

  await t.test('makeDraggableAndResizable attaches resize event listeners and resizes overlay proportionally', () => {
    docListeners = {};
    const resizeListeners = {};
    const overlay = {
      style: { left: '10px', top: '20px', width: '100px', height: '50px' },
      offsetWidth: 100,
      offsetHeight: 50,
      addEventListener: () => {}
    };
    const resizeHandle = {
      addEventListener: (type, fn) => {
        resizeListeners[type] = fn;
      }
    };

    localSignPdf.makeDraggableAndResizable(overlay, resizeHandle);

    assert.ok(resizeListeners['mousedown'], 'Resize handle should have mousedown listener');

    const origDocAddListener = mockDocument.addEventListener;
    const origDocRemoveListener = mockDocument.removeEventListener;
    mockDocument.addEventListener = (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    };
    mockDocument.removeEventListener = (type, fn) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter((l) => l !== fn);
      }
    };

    const startEvent = {
      type: 'mousedown',
      clientX: 200,
      clientY: 200,
      stopPropagation: () => {}
    };

    resizeListeners['mousedown'](startEvent);

    assert.ok(docListeners['mousemove'] && docListeners['mousemove'].length > 0, 'mousemove listener registered for resize');

    // Simulate resize mousemove (dx = +50, ratio = 50/100 = 0.5)
    const moveEvent = {
      type: 'mousemove',
      clientX: 250,
      clientY: 200
    };
    docListeners['mousemove'][0](moveEvent);

    assert.strictEqual(overlay.style.width, '150px');
    assert.strictEqual(overlay.style.height, '75px');

    docListeners['mouseup'][0]({ type: 'mouseup' });

    assert.strictEqual(docListeners['mousemove'].length, 0);

    mockDocument.addEventListener = origDocAddListener;
    mockDocument.removeEventListener = origDocRemoveListener;
  });
});

test('sign-pdf and edit-pdf option pills ARIA radiogroup attributes', async (t) => {
  await t.test('tools/sign-pdf/index.html uses role="radiogroup" and role="radio" on option pill groups', () => {
    const htmlPath = path.join(__dirname, '../tools/sign-pdf/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.match(html, /id="sign-mode-pills"[^>]*role="radiogroup"/);
    assert.match(html, /id="sign-color-pills"[^>]*role="radiogroup"/);

    const modeMatch = html.match(/id="sign-mode-pills"[\s\S]*?<\/div>/);
    assert.ok(modeMatch, 'sign-mode-pills block should exist');
    const modePillButtons = modeMatch[0].match(/<button[^>]*>/g) || [];
    for (const btn of modePillButtons) {
      assert.match(btn, /role="radio"/, 'Each button in sign-mode-pills should have role="radio"');
    }

    const colorMatch = html.match(/id="sign-color-pills"[\s\S]*?<\/div>/);
    assert.ok(colorMatch, 'sign-color-pills block should exist');
    const colorPillButtons = colorMatch[0].match(/<button[^>]*>/g) || [];
    for (const btn of colorPillButtons) {
      assert.match(btn, /role="radio"/, 'Each button in sign-color-pills should have role="radio"');
    }
  });

  await t.test('tools/edit-pdf/index.html uses role="radiogroup" and role="radio" on option pill groups', () => {
    const htmlPath = path.join(__dirname, '../tools/edit-pdf/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.match(html, /id="sig-mode-pills"[^>]*role="radiogroup"/);
    assert.match(html, /id="sig-color-pills"[^>]*role="radiogroup"/);

    const modeMatch = html.match(/id="sig-mode-pills"[\s\S]*?<\/div>/);
    assert.ok(modeMatch, 'sig-mode-pills block should exist');
    const modePillButtons = modeMatch[0].match(/<button[^>]*>/g) || [];
    for (const btn of modePillButtons) {
      assert.match(btn, /role="radio"/, 'Each button in sig-mode-pills should have role="radio"');
    }

    const colorMatch = html.match(/id="sig-color-pills"[\s\S]*?<\/div>/);
    assert.ok(colorMatch, 'sig-color-pills block should exist');
    const colorPillButtons = colorMatch[0].match(/<button[^>]*>/g) || [];
    for (const btn of colorPillButtons) {
      assert.match(btn, /role="radio"/, 'Each button in sig-color-pills should have role="radio"');
    }
  });
});

test('sign-pdf getPdfSignaturePlacement coordinate transformations across all rotations', async (t) => {
  await t.test('0 degree rotation correctly maps top-left normalized to bottom-left PDF coordinates', () => {
    const placement = getPdfSignaturePlacement({
      normX: 0.1,
      normY: 0.2,
      normW: 0.3,
      normH: 0.15,
      pageWidth: 600,
      pageHeight: 800,
      pageRotation: 0,
    });

    assert.strictEqual(placement.x, 60); // 0.1 * 600
    assert.strictEqual(placement.y, 520); // 800 - (0.2 + 0.15) * 800
    assert.strictEqual(placement.width, 180); // 0.3 * 600
    assert.strictEqual(placement.height, 120); // 0.15 * 800
    assert.strictEqual(placement.rotateDegrees, 0);
  });

  await t.test('90 degree rotation swaps axes and applies counter-clockwise rotation', () => {
    const placement = getPdfSignaturePlacement({
      normX: 0.1,
      normY: 0.2,
      normW: 0.3,
      normH: 0.15,
      pageWidth: 600,
      pageHeight: 800,
      pageRotation: 90,
    });

    assert.strictEqual(placement.x, 210); // (0.2 + 0.15) * 600
    assert.strictEqual(placement.y, 80); // 0.1 * 800
    assert.strictEqual(placement.width, 240); // 0.3 * 800 (visual width scaled along page height)
    assert.strictEqual(placement.height, 90); // 0.15 * 600 (visual height scaled along page width)
    assert.strictEqual(placement.rotateDegrees, 90);
  });

  await t.test('180 degree rotation inverts both axes and applies 180 degree rotation', () => {
    const placement = getPdfSignaturePlacement({
      normX: 0.1,
      normY: 0.2,
      normW: 0.3,
      normH: 0.15,
      pageWidth: 600,
      pageHeight: 800,
      pageRotation: 180,
    });

    assert.strictEqual(placement.x, 540); // (1 - 0.1) * 600
    assert.strictEqual(placement.y, 280); // (0.2 + 0.15) * 800
    assert.strictEqual(placement.width, 180); // 0.3 * 600
    assert.strictEqual(placement.height, 120); // 0.15 * 800
    assert.strictEqual(placement.rotateDegrees, 180);
  });

  await t.test('270 degree rotation swaps axes and applies 270 degree rotation', () => {
    const placement = getPdfSignaturePlacement({
      normX: 0.1,
      normY: 0.2,
      normW: 0.3,
      normH: 0.15,
      pageWidth: 600,
      pageHeight: 800,
      pageRotation: 270,
    });

    assert.strictEqual(placement.x, 390); // (1 - 0.2 - 0.15) * 600
    assert.strictEqual(placement.y, 720); // (1 - 0.1) * 800
    assert.strictEqual(placement.width, 240); // 0.3 * 800
    assert.strictEqual(placement.height, 90); // 0.15 * 600
    assert.strictEqual(placement.rotateDegrees, 270);
  });

  await t.test('handles non-zero CropBox/MediaBox origins accurately across rotations', () => {
    const placement0 = getPdfSignaturePlacement({
      normX: 0.2,
      normY: 0.1,
      normW: 0.4,
      normH: 0.2,
      pageWidth: 500,
      pageHeight: 700,
      pageRotation: 0,
      originX: 50,
      originY: 100,
    });
    assert.strictEqual(placement0.x, 150); // 50 + 0.2 * 500
    assert.strictEqual(placement0.y, 590); // 100 + 700 - 0.3 * 700 = 100 + 490 = 590

    const placement90 = getPdfSignaturePlacement({
      normX: 0.2,
      normY: 0.1,
      normW: 0.4,
      normH: 0.2,
      pageWidth: 500,
      pageHeight: 700,
      pageRotation: 90,
      originX: 50,
      originY: 100,
    });
    assert.ok(Math.abs(placement90.x - 200) < 0.001); // 50 + (0.1 + 0.2) * 500
    assert.ok(Math.abs(placement90.y - 240) < 0.001); // 100 + 0.2 * 700 = 100 + 140 = 240
  });

  await t.test('wraps arbitrary rotation angles (negative and > 360) correctly', () => {
    const p1 = getPdfSignaturePlacement({
      normX: 0.1, normY: 0.2, normW: 0.3, normH: 0.15,
      pageWidth: 600, pageHeight: 800, pageRotation: 450,
    });
    assert.strictEqual(p1.rotateDegrees, 90);

    const p2 = getPdfSignaturePlacement({
      normX: 0.1, normY: 0.2, normW: 0.3, normH: 0.15,
      pageWidth: 600, pageHeight: 800, pageRotation: -90,
    });
    assert.strictEqual(p2.rotateDegrees, 270);
  });
});

test('sign-pdf page dimension variations (A4, Letter, Portrait, Landscape)', async (t) => {
  await t.test('calculates accurate coordinates for A4 portrait (595.28 x 841.89)', () => {
    const placement = getPdfSignaturePlacement({
      normX: 0.5,
      normY: 0.8,
      normW: 0.3,
      normH: 0.1,
      pageWidth: 595.28,
      pageHeight: 841.89,
      pageRotation: 0,
    });

    assert.ok(Math.abs(placement.x - 297.64) < 0.01);
    assert.ok(Math.abs(placement.y - (841.89 - 0.9 * 841.89)) < 0.01);
    assert.ok(Math.abs(placement.width - 178.584) < 0.01);
    assert.ok(Math.abs(placement.height - 84.189) < 0.01);
  });

  await t.test('calculates accurate coordinates for A4 landscape (841.89 x 595.28)', () => {
    const placement = getPdfSignaturePlacement({
      normX: 0.25,
      normY: 0.75,
      normW: 0.2,
      normH: 0.1,
      pageWidth: 841.89,
      pageHeight: 595.28,
      pageRotation: 0,
    });

    assert.ok(Math.abs(placement.x - 0.25 * 841.89) < 0.01);
    assert.ok(Math.abs(placement.y - (595.28 - 0.85 * 595.28)) < 0.01);
    assert.ok(Math.abs(placement.width - 0.2 * 841.89) < 0.01);
    assert.ok(Math.abs(placement.height - 0.1 * 595.28) < 0.01);
  });

  await t.test('calculates accurate coordinates for Letter portrait (612 x 792)', () => {
    const placement = getPdfSignaturePlacement({
      normX: 0.1,
      normY: 0.5,
      normW: 0.25,
      normH: 0.125,
      pageWidth: 612,
      pageHeight: 792,
      pageRotation: 0,
    });

    assert.strictEqual(placement.x, 61.2);
    assert.strictEqual(placement.y, 792 - 0.625 * 792);
    assert.strictEqual(placement.width, 153);
    assert.strictEqual(placement.height, 99);
  });
});

test('sign-pdf normalized geometry & responsive synchronization', async (t) => {
  await t.test('updateOverlayPixelPosition converts normalized values to display pixels', () => {
    const mockOverlay = { style: {} };
    const sig = { normX: 0.25, normY: 0.5, normW: 0.2, normH: 0.1 };

    updateOverlayPixelPosition(mockOverlay, sig, 800, 600);

    assert.strictEqual(mockOverlay.style.left, '200px');
    assert.strictEqual(mockOverlay.style.top, '300px');
    assert.strictEqual(mockOverlay.style.width, '160px');
    assert.strictEqual(mockOverlay.style.height, '60px');
  });

  await t.test('resizing viewport recalculates display pixels while preserving normalized geometry', () => {
    const mockOverlay = { style: {} };
    const sig = { normX: 0.25, normY: 0.5, normW: 0.2, normH: 0.1 };

    // Initial scale at 800px width
    updateOverlayPixelPosition(mockOverlay, sig, 800, 1000);
    assert.strictEqual(mockOverlay.style.left, '200px');
    assert.strictEqual(mockOverlay.style.top, '500px');

    // Viewport shrunk to 400px width
    updateOverlayPixelPosition(mockOverlay, sig, 400, 500);
    assert.strictEqual(mockOverlay.style.left, '100px');
    assert.strictEqual(mockOverlay.style.top, '250px');
    assert.strictEqual(mockOverlay.style.width, '80px');
    assert.strictEqual(mockOverlay.style.height, '50px');

    // Normalized geometry remains unchanged
    assert.strictEqual(sig.normX, 0.25);
    assert.strictEqual(sig.normY, 0.5);
    assert.strictEqual(sig.normW, 0.2);
    assert.strictEqual(sig.normH, 0.1);
  });
});

test('sign-pdf multi-page signature persistence & PDF export', async (t) => {
  let docListeners = {};
  const activeOverlays = [];
  const capturedDrawCalls = [];

  const localDoc = {
    getElementById: (id) => createMockElement(id),
    querySelectorAll: (selector) => {
      if (selector === ".signature-overlay") return activeOverlays;
      if (selector === ".signature-overlay.selected") {
        return activeOverlays.filter((o) => o.classList.contains("selected"));
      }
      return [];
    },
    createElement: (tagName) => createMockElement(`el-${tagName}`),
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter((l) => l !== fn);
      }
    },
    body: { appendChild: () => {}, removeChild: () => {} }
  };

  const mockPdfLib = {
    degrees: (angle) => ({ type: 'degrees', angle }),
    PDFDocument: {
      load: async () => ({
        getPages: () => [
          {
            getWidth: () => 595,
            getHeight: () => 842,
            getRotation: () => ({ type: 'degrees', angle: 0 }),
            getX: () => 0,
            getY: () => 0,
            drawImage: (img, opts) => capturedDrawCalls.push({ pageNum: 1, img, opts })
          },
          {
            getWidth: () => 612,
            getHeight: () => 792,
            getRotation: () => ({ type: 'degrees', angle: 90 }),
            getX: () => 0,
            getY: () => 0,
            drawImage: (img, opts) => capturedDrawCalls.push({ pageNum: 2, img, opts })
          },
          {
            getWidth: () => 600,
            getHeight: () => 800,
            getCropBox: () => ({ x: 50, y: 100, width: 400, height: 500 }),
            getRotation: () => ({ type: 'degrees', angle: 0 }),
            getX: () => 0,
            getY: () => 0,
            drawImage: (img, opts) => capturedDrawCalls.push({ pageNum: 3, img, opts })
          }
        ],
        embedPng: async () => ({ width: 100, height: 50 }),
        embedJpg: async () => ({ width: 100, height: 50 }),
        save: async () => new Uint8Array([1, 2, 3])
      })
    }
  };

  const localWindow = {
    devicePixelRatio: 1,
    SignaturePad: MockSignaturePad,
    MutationObserver: MockMutationObserver,
    PDFLib: mockPdfLib,
    'pdfjs-dist/build/pdf': mockWindow['pdfjs-dist/build/pdf']
  };

  const localWrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setProgress',
    'activatePill',
    'Blob',
    'URL',
    'console',
    'MutationObserver',
    src
  );

  const localSignPdf = localWrapper(
    localDoc,
    localWindow,
    mockInitDropZone,
    mockShowToast,
    mockSetProgress,
    mockActivatePill,
    class Blob {},
    { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    mockConsole,
    MockMutationObserver
  );

  await t.test('signatures placed across multiple pages survive page switching and hidden display:none', async () => {
    activeOverlays.length = 0;
    capturedDrawCalls.length = 0;
    localSignPdf.resetTool();

    // 1. On Page 1: Place a signature
    localSignPdf.setCurrentPage(1);
    localSignPdf.setNumPages(2);
    localSignPdf.setPdfBytesOriginal(new ArrayBuffer(16));

    const sigOverlay1 = createMockElement('sig-overlay-1');
    sigOverlay1.className = 'signature-overlay';
    sigOverlay1.dataset.page = '1';
    sigOverlay1.dataset.id = 'sig-p1';
    sigOverlay1.dataset.normX = '0.2';
    sigOverlay1.dataset.normY = '0.3';
    sigOverlay1.dataset.normW = '0.25';
    sigOverlay1.dataset.normH = '0.1';
    sigOverlay1.style.display = 'block';
    sigOverlay1.querySelector = () => ({ src: 'data:image/png;base64,sig1' });

    // Register in signatures state map
    const sigs = localSignPdf.getSignatures();
    sigs.set('sig-p1', {
      id: 'sig-p1',
      pageNum: 1,
      src: 'data:image/png;base64,sig1',
      normX: 0.2,
      normY: 0.3,
      normW: 0.25,
      normH: 0.1,
      aspectRatio: 2.5
    });
    activeOverlays.push(sigOverlay1);

    // 2. Switch to Page 2: Page 1 overlay becomes display: none
    localSignPdf.setCurrentPage(2);
    sigOverlay1.style.display = 'none';

    // Place signature on Page 2
    const sigOverlay2 = createMockElement('sig-overlay-2');
    sigOverlay2.className = 'signature-overlay';
    sigOverlay2.dataset.page = '2';
    sigOverlay2.dataset.id = 'sig-p2';
    sigOverlay2.dataset.normX = '0.4';
    sigOverlay2.dataset.normY = '0.5';
    sigOverlay2.dataset.normW = '0.3';
    sigOverlay2.dataset.normH = '0.12';
    sigOverlay2.style.display = 'block';
    sigOverlay2.querySelector = () => ({ src: 'data:image/png;base64,sig2' });

    sigs.set('sig-p2', {
      id: 'sig-p2',
      pageNum: 2,
      src: 'data:image/png;base64,sig2',
      normX: 0.4,
      normY: 0.5,
      normW: 0.3,
      normH: 0.12,
      aspectRatio: 2.5
    });
    activeOverlays.push(sigOverlay2);

    // Verify Page 1 overlay is hidden
    assert.strictEqual(sigOverlay1.style.display, 'none');
    assert.strictEqual(sigOverlay2.style.display, 'block');

    // 3. Trigger download button while on Page 2
    const downloadBtn = elementMap['sign-download-btn'];
    assert.ok(downloadBtn, 'Download button exists');
    downloadBtn.click();

    // Allow async PDF generation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify both signatures were embedded
    assert.strictEqual(capturedDrawCalls.length, 2, 'Both signatures must be drawn to PDF');

    // Page 1 signature assertions (0° rotation, A4 portrait 595 x 842)
    const call1 = capturedDrawCalls.find((c) => c.pageNum === 1);
    assert.ok(call1, 'Page 1 draw call should exist');
    assert.ok(call1.opts.width > 0, 'Page 1 signature width must not be zero');
    assert.ok(call1.opts.height > 0, 'Page 1 signature height must not be zero');
    assert.strictEqual(call1.opts.x, 0.2 * 595);
    assert.strictEqual(call1.opts.width, 0.25 * 595);
    assert.strictEqual(call1.opts.rotate.angle, 0);

    // Page 2 signature assertions (90° rotation, Letter 612 x 792)
    const call2 = capturedDrawCalls.find((c) => c.pageNum === 2);
    assert.ok(call2, 'Page 2 draw call should exist');
    assert.ok(call2.opts.width > 0, 'Page 2 signature width must not be zero');
    assert.ok(call2.opts.height > 0, 'Page 2 signature height must not be zero');
    assert.strictEqual(call2.opts.rotate.angle, 90, 'Page 2 signature must be rotated 90 degrees');
  });

  await t.test('PDF export uses getCropBox origin and dimensions when present', async () => {
    activeOverlays.length = 0;
    capturedDrawCalls.length = 0;
    localSignPdf.resetTool();

    localSignPdf.setCurrentPage(3);
    localSignPdf.setNumPages(3);
    localSignPdf.setPdfBytesOriginal(new ArrayBuffer(16));

    const sigs = localSignPdf.getSignatures();
    sigs.set('sig-p3', {
      id: 'sig-p3',
      pageNum: 3,
      src: 'data:image/png;base64,sig3',
      normX: 0.1,
      normY: 0.2,
      normW: 0.3,
      normH: 0.15,
      aspectRatio: 2.0
    });

    const downloadBtn = elementMap['sign-download-btn'];
    downloadBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const call3 = capturedDrawCalls.find((c) => c.pageNum === 3);
    assert.ok(call3, 'Page 3 draw call should exist');
    // CropBox: x=50, y=100, width=400, height=500, rotation=0
    // normX=0.1 -> x = 50 + 0.1 * 400 = 90
    // normY=0.2, normH=0.15 -> y = 100 + 500 - (0.2 + 0.15) * 500 = 600 - 175 = 425
    // width = 0.3 * 400 = 120
    // height = 0.15 * 500 = 75
    assert.strictEqual(call3.opts.x, 90);
    assert.strictEqual(call3.opts.y, 425);
    assert.strictEqual(call3.opts.width, 120);
    assert.strictEqual(call3.opts.height, 75);
  });

  await t.test('resetTool clears signatures state map and resets tool', () => {
    localSignPdf.resetTool();
    const sigs = localSignPdf.getSignatures();
    assert.strictEqual(sigs.size, 0);

    sigs.set('temp', { id: 'temp', pageNum: 1 });
    assert.strictEqual(sigs.size, 1);

    localSignPdf.resetTool();
    assert.strictEqual(sigs.size, 0, 'resetTool must empty signatures map');
  });
});
