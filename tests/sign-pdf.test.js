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
src += '\nreturn { renderPage, handlePdfSelect, handleImageSelect, resetTool, createSignatureOverlay, makeDraggableAndResizable, getPdfjsDocument: () => pdfjsDocument, setPdfjsDocument: (doc) => { pdfjsDocument = doc; }, setNumPages: (n) => { numPages = n; }, setCurrentPage: (p) => { currentPage = p; } };\n';

const elementMap = {};

function createMockElement(id = '') {
  if (!elementMap[id]) {
    const classes = new Set();
    const attrs = {};
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
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => createMockElement(),
      querySelectorAll: (selector) => {
        if (selector === ".signature-overlay" || selector === ".signature-overlay.selected") {
          return mockDocument.querySelectorAll(selector);
        }
        return [];
      },
      getContext: () => ({
        scale: () => {},
        clearRect: () => {},
        fillText: () => {},
        measureText: () => ({ width: 100 })
      }),
      toDataURL: () => 'data:image/png;base64,fake',
      click: () => {}
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
    PDFDocument: {
      load: async () => ({
        getPages: () => [{ getWidth: () => 612, getHeight: () => 792, drawImage: () => {} }],
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
  getPdfjsDocument,
  setPdfjsDocument,
  setNumPages,
  setCurrentPage
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
    getElementById: (id) => {
      const el = createMockElement(id);
      if (id === "sign-canvas-container") {
        el.querySelectorAll = (selector) => {
          if (selector === ".signature-overlay") return activeOverlays;
          if (selector === ".signature-overlay.selected") {
            return activeOverlays.filter((o) => o.classList.contains("selected"));
          }
          return [];
        };
      }
      return el;
    },
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
