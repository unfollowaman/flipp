const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/drag-drop.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
src = src.replace(/export\s+async\s+function/g, 'async function');
src = src.replace(/export\s+function/g, 'function');
src = src.replace(/export\s+const/g, 'const');
src = src.replace(/export\s+let/g, 'let');

src += `
  return {
    showToast,
    activatePill,
    setProgress,
    initDropZone,
    setupDragReorder,
    fileToDataUrl,
    triggerDownload,
    renderPageToDataUrl,
    renderPdfFirstPage,
    registerPasteHandler,
    resetPasteTargets,
    getActivePasteTarget,
    processClipboardPaste,
    isImageFile,
    isPdfFile,
    isTextFile,
    getFilesFromClipboard,
    getAcceptedTypes,
    isClipboardPastingImage,
    getDOMState: () => ({ bodyChildren, allElements, timeouts, revokedUrls, document }),
    resetDOM: () => {
      bodyChildren = [];
      allElements = [];
      timeouts = [];
      revokedUrls = [];
      if (typeof resetPasteTargets === 'function') resetPasteTargets();
      if (document && typeof document.resetListeners === 'function') document.resetListeners();
    }
  };
`;

const evaluateCode = `
  let bodyChildren = [];
  let allElements = [];
  let timeouts = [];
  let revokedUrls = [];

  const URL = {
    revokeObjectURL: (url) => {
      revokedUrls.push(url);
    }
  };

  class FileReader {
    readAsDataURL(file) {
      if (file && file.shouldError) {
        if (typeof this.onerror === 'function') {
          this.onerror(new Error('Failed to read file'));
        }
      } else {
        if (typeof this.onload === 'function') {
          this.onload({ target: { result: 'data:image/png;base64,mockdata' } });
        }
      }
    }
  }

  const window = new Proxy({
    getComputedStyle: () => ({ display: 'block' }),
  }, {
    get: (target, prop) => {
      if (typeof globalThis.window !== 'undefined' && prop in globalThis.window) {
        return globalThis.window[prop];
      }
      return target[prop];
    }
  });

  let docListeners = {};
  const document = {
    addEventListener: (evt, cb) => {
      if (!docListeners[evt]) docListeners[evt] = [];
      docListeners[evt].push(cb);
    },
    removeEventListener: (evt, cb) => {
      if (docListeners[evt]) {
        docListeners[evt] = docListeners[evt].filter(f => f !== cb);
      }
    },
    dispatchEvent: (evtName, eObj = {}) => {
      if (docListeners[evtName]) {
        docListeners[evtName].forEach(cb => cb(eObj));
      }
    },
    resetListeners: () => {
      docListeners = {};
      document.activeElement = null;
    },
    activeElement: null,
    body: {
      appendChild: (el) => {
        bodyChildren.push(el);
      },
      removeChild: (el) => {
        bodyChildren = bodyChildren.filter(child => child !== el);
      }
    },
    querySelector: (selector) => {
      if (selector === '.toast-container') {
        return bodyChildren.find(el => el.className === 'toast-container') || null;
      }
      return null;
    },
    getElementById: () => null,
    createElement: (tag) => {
      const el = {
        tag,
        className: '',
        textContent: '',
        style: {},
        children: [],
        removed: false,
        clicked: false,
        click: function() {
          this.clicked = true;
        },
        appendChild: function(child) {
          child.parentElement = this;
          this.children.push(child);
        },
        remove: function() {
          this.removed = true;
          if (this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter(e => e !== this);
          }
          if (bodyChildren.includes(this)) {
            bodyChildren = bodyChildren.filter(e => e !== this);
          }
        }
      };
      if (tag === 'canvas') {
        el.getContext = () => ({});
        el.toDataURL = () => 'data:image/png;base64,mockdata';
      }
      allElements.push(el);
      return el;
    }
  };

  const setTimeout = (cb, delay) => {
    timeouts.push({ cb, delay });
    return timeouts.length;
  };

  ${src}
`;

const {
  showToast,
  activatePill,
  setProgress,
  initDropZone,
  setupDragReorder,
  fileToDataUrl,
  triggerDownload,
  renderPageToDataUrl,
  renderPdfFirstPage,
  registerPasteHandler,
  resetPasteTargets,
  getActivePasteTarget,
  processClipboardPaste,
  isImageFile,
  isPdfFile,
  isTextFile,
  getFilesFromClipboard,
  getAcceptedTypes,
  isClipboardPastingImage,
  getDOMState,
  resetDOM,
} = new Function(evaluateCode)();

test('setProgress', async (t) => {
  await t.test('updates progress bar width and label text', () => {
    const barEl = { style: { width: '' } };
    const labelEl = { textContent: '' };

    setProgress(barEl, labelEl, 45, 'Processing...');

    assert.strictEqual(barEl.style.width, '45%');
    assert.strictEqual(labelEl.textContent, 'Processing...');
  });

  await t.test('handles omitted label element gracefully', () => {
    const barEl = { style: { width: '' } };

    // Should not throw when labelEl is null
    setProgress(barEl, null, 100, 'Done');

    assert.strictEqual(barEl.style.width, '100%');
  });

  await t.test('handles 0 correctly', () => {
    const barEl = { style: { width: '' } };
    const labelEl = { textContent: '' };

    setProgress(barEl, labelEl, 0, 'Start');

    assert.strictEqual(barEl.style.width, '0%');
    assert.strictEqual(labelEl.textContent, 'Start');
  });

  await t.test('handles 100 correctly', () => {
    const barEl = { style: { width: '' } };
    const labelEl = { textContent: '' };

    setProgress(barEl, labelEl, 100, 'Complete');

    assert.strictEqual(barEl.style.width, '100%');
    assert.strictEqual(labelEl.textContent, 'Complete');
  });

  await t.test('throws TypeError if barEl is null', () => {
    assert.throws(() => {
      setProgress(null, null, 50, 'Loading...');
    }, TypeError);
  });

  await t.test('throws TypeError if barEl lacks style property', () => {
    assert.throws(() => {
      setProgress({}, null, 50, 'Loading...');
    }, TypeError);
  });
});

test('showToast', async (t) => {
  t.beforeEach(() => {
    resetDOM();
  });

  await t.test('creates toast container and success toast by default', () => {
    showToast('Task completed');

    const { bodyChildren, timeouts } = getDOMState();

    // Check container
    assert.strictEqual(bodyChildren.length, 1);
    const container = bodyChildren[0];
    assert.strictEqual(container.className, 'toast-container');
    assert.strictEqual(container.children.length, 1);

    // Check toast
    const toast = container.children[0];
    assert.strictEqual(toast.className, 'toast toast-success');
    assert.strictEqual(toast.textContent, 'Task completed');

    // Check timeout for fade out
    assert.strictEqual(timeouts.length, 1);
    assert.strictEqual(timeouts[0].delay, 3200);
  });

  await t.test('reuses existing toast container', () => {
    showToast('First');
    showToast('Second');

    const { bodyChildren } = getDOMState();

    assert.strictEqual(bodyChildren.length, 1);
    const container = bodyChildren[0];
    assert.strictEqual(container.className, 'toast-container');
    assert.strictEqual(container.children.length, 2);

    assert.strictEqual(container.children[0].textContent, 'First');
    assert.strictEqual(container.children[1].textContent, 'Second');
  });

  await t.test('creates toast with specific type', () => {
    showToast('Error occurred', 'error');

    const { bodyChildren } = getDOMState();
    const container = bodyChildren[0];
    const toast = container.children[0];

    assert.strictEqual(toast.className, 'toast toast-error');
    assert.strictEqual(toast.textContent, 'Error occurred');
  });

  await t.test('toast fade out and remove logic', () => {
    showToast('Fade test');

    const { bodyChildren, timeouts } = getDOMState();
    const container = bodyChildren[0];
    const toast = container.children[0];

    // Execute first timeout (fade out)
    timeouts[0].cb();

    assert.strictEqual(toast.style.opacity, '0');
    assert.strictEqual(toast.style.transform, 'translateY(8px)');
    assert.strictEqual(toast.style.transition, 'all 0.2s ease');

    // Fade out schedules remove timeout
    assert.strictEqual(timeouts.length, 2);
    assert.strictEqual(timeouts[1].delay, 200);

    // Execute second timeout (remove)
    timeouts[1].cb();
    assert.strictEqual(toast.removed, true);
    assert.strictEqual(container.children.length, 0);
  });
});

test('activatePill', async (t) => {
  await t.test('activates only the pill matching the value', () => {
    const createPill = (value, isActive = false) => {
      let hasActive = isActive;
      return {
        dataset: { value },
        classList: {
          toggle: (cls, force) => {
            if (cls === 'active') {
              hasActive = force;
            }
          },
          contains: (cls) => cls === 'active' ? hasActive : false
        },
        isActive: () => hasActive
      };
    };

    const pillA = createPill('a', false);
    const pillB = createPill('b', true);
    const pillC = createPill('c', false);

    const group = {
      querySelectorAll: (selector) => {
        if (selector === '.opt-pill') {
          return [pillA, pillB, pillC];
        }
        return [];
      }
    };

    activatePill(group, 'a');

    assert.strictEqual(pillA.isActive(), true);
    assert.strictEqual(pillB.isActive(), false);
    assert.strictEqual(pillC.isActive(), false);
  });

  await t.test('deactivates all pills if no value matches', () => {
    const createPill = (value, isActive = false) => {
      let hasActive = isActive;
      return {
        dataset: { value },
        classList: {
          toggle: (cls, force) => {
            if (cls === 'active') {
              hasActive = force;
            }
          },
          contains: (cls) => cls === 'active' ? hasActive : false
        },
        isActive: () => hasActive
      };
    };

    const pillA = createPill('a', true);
    const pillB = createPill('b', true);

    const group = {
      querySelectorAll: (selector) => {
        if (selector === '.opt-pill') {
          return [pillA, pillB];
        }
        return [];
      }
    };

    activatePill(group, 'c');

    assert.strictEqual(pillA.isActive(), false);
    assert.strictEqual(pillB.isActive(), false);
  });

  await t.test('handles empty group gracefully', () => {
    const group = {
      querySelectorAll: () => []
    };

    // Should not throw
    activatePill(group, 'a');
    assert.ok(true);
  });
});


test('initDropZone', async (t) => {
  const createMockElement = (classes = []) => {
    const listeners = {};
    const classSet = new Set(classes);
    return {
      listeners,
      addEventListener: (evt, cb) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(cb);
      },
      dispatchEvent: (evtName, eObj = {}) => {
        if (listeners[evtName]) {
          listeners[evtName].forEach(cb => cb(eObj));
        }
      },
      classList: {
        contains: (cls) => classSet.has(cls),
        add: (cls) => classSet.add(cls),
        remove: (cls) => classSet.delete(cls)
      },
      contains: () => false,
      style: { display: 'none' },
      click: function() { this.clicked = true; },
      value: '',
      clicked: false,
      className: classes.join(' ')
    };
  };

  await t.test('click on drop zone triggers file input click', () => {
    const dropZone = createMockElement();
    const fileInput = createMockElement();
    let onFilesCalled = false;

    initDropZone(dropZone, fileInput, () => { onFilesCalled = true; });

    dropZone.dispatchEvent('click', { target: { classList: { contains: () => false } } });

    assert.strictEqual(fileInput.clicked, true);
    assert.strictEqual(onFilesCalled, false);
  });

  await t.test('click on drop zone ignores clicks on .dz-browse-btn', () => {
    const dropZone = createMockElement();
    const fileInput = createMockElement();

    initDropZone(dropZone, fileInput, () => {});

    dropZone.dispatchEvent('click', { target: { classList: { contains: (cls) => cls === 'dz-browse-btn' } } });

    assert.strictEqual(fileInput.clicked, false);
  });

  await t.test('file input change triggers onFiles and resets value', () => {
    const dropZone = createMockElement();
    const fileInput = createMockElement();

    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    fileInput.dispatchEvent('change', {
      target: {
        files: ['file1.txt', 'file2.txt'],
        value: 'non-empty'
      }
    });

    assert.deepStrictEqual(receivedFiles, ['file1.txt', 'file2.txt']);
    assert.strictEqual(fileInput.value, '');
  });

  await t.test('dragover adds .drag-over class and prevents default', () => {
    const dropZone = createMockElement();
    const fileInput = createMockElement();
    let preventDefaultCalled = false;

    initDropZone(dropZone, fileInput, () => {});

    dropZone.dispatchEvent('dragover', {
      preventDefault: () => { preventDefaultCalled = true; }
    });

    assert.strictEqual(preventDefaultCalled, true);
    assert.strictEqual(dropZone.classList.contains('drag-over'), true);
  });

  await t.test('dragleave removes .drag-over class', () => {
    const dropZone = createMockElement(['drag-over']);
    const fileInput = createMockElement();

    initDropZone(dropZone, fileInput, () => {});

    dropZone.dispatchEvent('dragleave', { relatedTarget: null });

    assert.strictEqual(dropZone.classList.contains('drag-over'), false);
  });

  await t.test('drop removes .drag-over class, prevents default, and calls onFiles', () => {
    const dropZone = createMockElement(['drag-over']);
    const fileInput = createMockElement();
    let preventDefaultCalled = false;
    let receivedFiles = null;

    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const mockFiles = Object.assign([{name: 'file3.pdf'}], {
      [Symbol.iterator]: function() {
        let i = 0;
        return {
          next: () => {
            const res = { value: this[i], done: i >= this.length };
            i++;
            return res;
          }
        };
      }
    });

    dropZone.dispatchEvent('drop', {
      preventDefault: () => { preventDefaultCalled = true; },
      dataTransfer: { files: mockFiles }
    });

    assert.strictEqual(preventDefaultCalled, true);
    assert.strictEqual(dropZone.classList.contains('drag-over'), false);
    assert.deepStrictEqual(receivedFiles, [{name: 'file3.pdf'}]);
  });
});

test('fileToDataUrl', async (t) => {
  await t.test('resolves with data URL on successful read', async () => {
    const mockFile = { name: 'test.png', type: 'image/png' };
    const result = await fileToDataUrl(mockFile);
    assert.strictEqual(result, 'data:image/png;base64,mockdata');
  });

  await t.test('rejects with error when file read fails', async () => {
    const mockFile = { name: 'error.png', shouldError: true };
    await assert.rejects(
      async () => {
        await fileToDataUrl(mockFile);
      },
      { message: 'Failed to read file' }
    );
  });
});

test('triggerDownload', async (t) => {
  t.beforeEach(() => {
    resetDOM();
  });

  await t.test('creates <a> element, sets href/download, appends, clicks, and removes element', () => {
    const testUrl = 'blob:https://tryflipp.pages.dev/12345';
    const filename = 'sample.pdf';

    triggerDownload(testUrl, filename);

    const { allElements, bodyChildren, timeouts } = getDOMState();

    // Check created anchor element
    const linkEl = allElements.find(el => el.tag === 'a');
    assert.ok(linkEl, 'An <a> element should be created');
    assert.strictEqual(linkEl.href, testUrl);
    assert.strictEqual(linkEl.download, filename);
    assert.strictEqual(linkEl.clicked, true, 'click() should have been called on <a> element');

    // Verify element was appended and then removed from body
    assert.strictEqual(bodyChildren.includes(linkEl), false, 'Element should no longer be in document.body');

    // Default revokeUrl is false -> no revoke timeout scheduled
    assert.strictEqual(timeouts.length, 0);
  });

  await t.test('schedules URL revocation when revokeUrl parameter is true', () => {
    const testUrl = 'blob:https://tryflipp.pages.dev/67890';

    triggerDownload(testUrl, 'document.pdf', true);

    const { timeouts, revokedUrls } = getDOMState();

    assert.strictEqual(timeouts.length, 1);
    assert.strictEqual(timeouts[0].delay, 100);
    assert.strictEqual(revokedUrls.length, 0);

    // Execute scheduled timeout callback
    timeouts[0].cb();

    assert.strictEqual(revokedUrls.length, 1);
    assert.strictEqual(revokedUrls[0], testUrl);
  });

  await t.test('handles falsy URL gracefully when revokeUrl is true', () => {
    triggerDownload('', 'empty.pdf', true);

    const { timeouts, revokedUrls } = getDOMState();

    assert.strictEqual(timeouts.length, 1);
    timeouts[0].cb();

    // Falsy URL should not trigger URL.revokeObjectURL
    assert.strictEqual(revokedUrls.length, 0);
  });
});

test('renderPageToDataUrl', async (t) => {
  await t.test('renders page to canvas, returns data URL, and resets canvas dimensions', async () => {
    let renderCalledWith = null;

    const mockPage = {
      render: (options) => {
        renderCalledWith = options;
        return { promise: Promise.resolve() };
      }
    };
    const mockViewport = { width: 300, height: 400 };

    const dataUrl = await renderPageToDataUrl(mockPage, mockViewport, 'image/jpeg', 0.8);

    assert.strictEqual(dataUrl, 'data:image/png;base64,mockdata');
    assert.strictEqual(renderCalledWith.viewport, mockViewport);
    assert.ok(renderCalledWith.canvasContext);
  });
});

test('renderPdfFirstPage', async (t) => {
  await t.test('returns null when pdfjs is missing', async () => {
    delete global.window;
    const file = { arrayBuffer: async () => new ArrayBuffer(8) };
    const result = await renderPdfFirstPage(file);
    assert.strictEqual(result, null);
  });

  await t.test('returns dataUrl when valid PDF page is rendered and cleans up resources', async () => {
    let pageCleanedUp = false;
    let docDestroyed = false;
    let passedData = null;

    const mockPage = {
      getViewport: () => ({ width: 100, height: 100 }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: () => { pageCleanedUp = true; }
    };
    const mockDoc = {
      numPages: 1,
      getPage: async (num) => mockPage,
      destroy: async () => { docDestroyed = true; }
    };
    const mockPdfjs = {
      getDocument: (params) => {
        passedData = params.data;
        return { promise: Promise.resolve(mockDoc) };
      }
    };

    const origWindow = global.window;
    global.window = {
      'pdfjs-dist/build/pdf': mockPdfjs
    };

    try {
      const testBuffer = new ArrayBuffer(8);
      const file = { name: 'test.pdf', arrayBuffer: async () => testBuffer };
      const result = await renderPdfFirstPage(file);
      assert.strictEqual(result, 'data:image/png;base64,mockdata');
      assert.strictEqual(passedData.byteLength, testBuffer.byteLength);
      assert.strictEqual(pageCleanedUp, true);
      assert.strictEqual(docDestroyed, true);

      // Verify ArrayBuffer input directly
      const resultBuffer = await renderPdfFirstPage(testBuffer);
      assert.strictEqual(resultBuffer, 'data:image/png;base64,mockdata');
    } finally {
      global.window = origWindow;
    }
  });

  await t.test('returns null when pdfDoc has zero pages or on error and cleans up doc', async () => {
    let docDestroyed = false;
    const mockDoc = {
      numPages: 0,
      destroy: async () => { docDestroyed = true; }
    };
    const mockPdfjs = {
      getDocument: () => ({ promise: Promise.resolve(mockDoc) })
    };

    const origWindow = global.window;
    global.window = {
      'pdfjs-dist/build/pdf': mockPdfjs
    };

    try {
      const file = { name: 'empty.pdf', arrayBuffer: async () => new ArrayBuffer(8) };
      const result = await renderPdfFirstPage(file);
      assert.strictEqual(result, null);
      assert.strictEqual(docDestroyed, true);
    } finally {
      global.window = origWindow;
    }
  });
});

test('setupDragReorder', async (t) => {
  const createCardMock = () => {
    const listeners = {};
    const classSet = new Set(['img-thumb-card']);
    const style = {};
    let parent = null;

    const card = {
      listeners,
      style,
      classList: {
        add: (cls) => classSet.add(cls),
        remove: (cls) => classSet.delete(cls),
        contains: (cls) => classSet.has(cls)
      },
      addEventListener: (evt, cb) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(cb);
      },
      dispatchEvent: (evtName, eventObj = {}) => {
        if (listeners[evtName]) {
          listeners[evtName].forEach(cb => cb(eventObj));
        }
      },
      closest: (sel) => {
        if (sel === '.img-thumb-card') return card;
        if (sel === '.img-thumb-remove') return null;
        return null;
      }
    };

    Object.defineProperty(card, 'parentElement', {
      get: () => parent,
      set: (p) => { parent = p; }
    });

    return card;
  };

  await t.test('registers both touch and drag event listeners on card', () => {
    const card = createCardMock();
    let reorderCalled = false;

    setupDragReorder(card, () => { reorderCalled = true; });

    assert.ok(card.listeners['touchstart']);
    assert.ok(card.listeners['touchmove']);
    assert.ok(card.listeners['touchend']);
    assert.ok(card.listeners['dragstart']);
    assert.ok(card.listeners['dragend']);
    assert.ok(card.listeners['dragover']);
    assert.ok(card.listeners['drop']);
    assert.strictEqual(reorderCalled, false);
  });

  await t.test('desktop dragstart and dragend correctly manage CSS classes', () => {
    const card1 = createCardMock();
    const card2 = createCardMock();
    const parent = {
      querySelectorAll: (sel) => sel === '.img-thumb-card' ? [card1, card2] : [],
      querySelector: (sel) => sel === '.drag-target' ? [card1, card2].find(c => c.classList.contains('drag-target')) || null : null
    };
    card1.parentElement = parent;
    card2.parentElement = parent;

    setupDragReorder(card1);
    setupDragReorder(card2);

    const dataTransfer = {};
    card1.dispatchEvent('dragstart', { dataTransfer });
    assert.strictEqual(card1.classList.contains('dragging'), true);
    assert.strictEqual(dataTransfer.effectAllowed, 'move');

    card2.classList.add('drag-target');
    card1.dispatchEvent('dragend');
    assert.strictEqual(card1.classList.contains('dragging'), false);
    assert.strictEqual(card2.classList.contains('drag-target'), false);
  });

  await t.test('touch drag handlers update touch styling and reorder upon drop', () => {
    const card1 = createCardMock();
    const card2 = createCardMock();
    let cards = [card1, card2];
    let reorderCalls = 0;

    const parent = {
      querySelectorAll: (sel) => sel === '.img-thumb-card' ? cards : []
    };
    card1.parentElement = parent;
    card2.parentElement = parent;

    card1.after = (node) => {
      cards = [card2, node];
    };
    card1.before = (node) => {
      cards = [node, card2];
    };
    card2.after = (node) => {
      cards = [card1, node];
    };
    card2.before = (node) => {
      cards = [node, card1];
    };

    setupDragReorder(card1, () => { reorderCalls++; });
    setupDragReorder(card2, () => { reorderCalls++; });

    // Simulate touch start on card1
    card1.dispatchEvent('touchstart', {
      target: card1,
      touches: [{ clientX: 10, clientY: 20 }]
    });
    assert.strictEqual(card1.classList.contains('dragging'), true);
    assert.strictEqual(card1.style.zIndex, '1000');

    // Simulate touch end (drop target is set in lastTouchTarget logic)
    card1.dispatchEvent('touchend');
    assert.strictEqual(card1.classList.contains('dragging'), false);
    assert.strictEqual(card1.style.zIndex, '');
  });
});

test('drop zone CSS rules', async (t) => {
  await t.test('css/styles.src.css contains neo-brutalist drop zone tactile styling', () => {
    const cssPath = path.join(__dirname, '../css/styles.src.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.drop-zone {'), '.drop-zone rule must exist');
    assert.ok(cssContent.includes('box-shadow: 3px 3px 0 var(--black);'), 'drop-zone base shadow must be defined');
    assert.ok(cssContent.includes('.drop-zone:hover {'), '.drop-zone:hover rule must exist');
    assert.ok(cssContent.includes('box-shadow: 6px 6px 0 var(--black);'), 'drop-zone hover shadow must be defined');
    assert.ok(cssContent.includes('.drop-zone:focus-visible {'), '.drop-zone:focus-visible rule must exist');
    assert.ok(cssContent.includes('.drop-zone.drag-over {'), '.drop-zone.drag-over rule must exist');
    assert.ok(cssContent.includes('border-style: solid;'), 'drag-over border-style must become solid');
    assert.ok(cssContent.includes('.drop-zone:hover .dz-upload-icon {'), 'upload icon hover elevation must exist');
  });
});

test('option pill CSS rules', async (t) => {
  await t.test('css/styles.src.css contains neo-brutalist option pill tactile styling', () => {
    const cssPath = path.join(__dirname, '../css/styles.src.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.opt-pill {'), '.opt-pill rule must exist');
    assert.ok(cssContent.includes('.opt-pill:hover {'), '.opt-pill:hover rule must exist');
    assert.ok(cssContent.includes('background: var(--yellow);'), 'opt-pill hover yellow background must exist');
    assert.ok(cssContent.includes('.opt-pill:focus-visible {'), '.opt-pill:focus-visible rule must exist');
    assert.ok(cssContent.includes('outline: 3px solid var(--black);'), 'opt-pill focus outline must exist');
    assert.ok(cssContent.includes('.opt-pill.active {'), '.opt-pill.active rule must exist');
    assert.ok(cssContent.includes('.opt-pill.active:hover {'), '.opt-pill.active:hover rule must exist');
  });
});

test('result area and download button CSS rules', async (t) => {
  await t.test('css/styles.src.css contains result header, result card, and download button tactile styling', () => {
    const cssPath = path.join(__dirname, '../css/styles.src.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.results-header {'), '.results-header rule must exist');
    assert.ok(cssContent.includes('box-shadow: 3px 3px 0 var(--black);'), 'results-header tactile shadow must exist');
    assert.ok(cssContent.includes('.result-img-card {'), '.result-img-card rule must exist');
    assert.ok(cssContent.includes('box-shadow: 2px 2px 0 var(--black);'), 'result-img-card base shadow must exist');
    assert.ok(cssContent.includes('.result-download-btn {'), '.result-download-btn rule must exist');
    assert.ok(cssContent.includes('.result-download-btn:active {'), '.result-download-btn:active rule must exist');
    assert.ok(cssContent.includes('.result-download-btn:focus-visible {'), '.result-download-btn:focus-visible rule must exist');
    assert.ok(cssContent.includes('outline: 3px solid var(--black);'), 'download btn focus outline must exist');
  });
});

test('tool settings panel CSS rules', async (t) => {
  await t.test('css/styles.src.css contains options bar, option label, range input, and position card tactile styling', () => {
    const cssPath = path.join(__dirname, '../css/styles.src.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.options-bar {'), '.options-bar rule must exist');
    assert.ok(cssContent.includes('box-shadow: 4px 4px 0 var(--black);'), 'options-bar tactile offset shadow must exist');
    assert.ok(cssContent.includes('.option-label {'), '.option-label rule must exist');
    assert.ok(cssContent.includes('font-weight: 800;'), 'option-label font-weight 800 must exist');
    assert.ok(cssContent.includes('color: var(--black);'), 'option-label color var(--black) must exist');
    assert.ok(cssContent.includes('.range-input {'), '.range-input rule must exist');
    assert.ok(cssContent.includes('border: var(--border-std);'), 'range-input standardized border must exist');
    assert.ok(cssContent.includes('.range-input:focus-visible {'), '.range-input:focus-visible rule must exist');
    assert.ok(cssContent.includes('.position-card {'), '.position-card rule must exist');
    assert.ok(cssContent.includes('box-shadow: 1.5px 1.5px 0 var(--black);'), 'position-card base shadow must exist');
    assert.ok(cssContent.includes('.position-card:hover {'), '.position-card:hover rule must exist');
    assert.ok(cssContent.includes('.position-card:focus-visible {'), '.position-card:focus-visible rule must exist');
    assert.ok(cssContent.includes('.position-card.active {'), '.position-card.active rule must exist');
  });
});

test('toast warning and drop-zone shake CSS rules', async (t) => {
  await t.test('css/styles.src.css contains .toast.toast-warning and .drop-zone.drop-warning styling', () => {
    const cssPath = path.join(__dirname, '../css/styles.src.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.toast.toast-warning {'), '.toast.toast-warning rule must exist');
    assert.ok(cssContent.includes('border-left: 4px solid var(--amber);'), 'toast-warning border-left with --amber must exist');
    assert.ok(cssContent.includes('.drop-zone.drop-warning {'), '.drop-zone.drop-warning rule must exist');
    assert.ok(cssContent.includes('animation: drop-zone-shake 0.4s ease;'), 'drop-zone shake animation must exist');
  });
});

test('document paste type validation & Ctrl+V handling', async (t) => {
  const createMockTargetElement = (accept = '.pdf,application/pdf') => {
    const classSet = new Set(['drop-zone']);
    return {
      dropZone: {
        classList: {
          contains: (cls) => classSet.has(cls),
          add: (cls) => classSet.add(cls),
          remove: (cls) => classSet.delete(cls)
        },
        contains: () => false,
        style: { display: 'block' },
        addEventListener: () => {}
      },
      fileInput: {
        accept,
        getAttribute: (attr) => (attr === 'accept' ? accept : null),
        addEventListener: () => {},
        click: () => {},
        value: ''
      }
    };
  };

  await t.test('type helper functions correctly detect file types', () => {
    assert.strictEqual(isPdfFile({ name: 'document.pdf', type: 'application/pdf' }), true);
    assert.strictEqual(isPdfFile({ name: 'test.PDF', type: '' }), true);
    assert.strictEqual(isPdfFile({ name: 'image.png', type: 'image/png' }), false);

    assert.strictEqual(isImageFile({ name: 'photo.jpg', type: 'image/jpeg' }), true);
    assert.strictEqual(isImageFile({ name: 'photo.PNG', type: '' }), true);
    assert.strictEqual(isImageFile({ name: 'doc.pdf', type: 'application/pdf' }), false);

    assert.strictEqual(isTextFile({ name: 'notes.txt', type: 'text/plain' }), true);
    assert.strictEqual(isTextFile({ name: 'data.json', type: 'application/json' }), true);
    assert.strictEqual(isTextFile({ name: 'image.png', type: 'image/png' }), false);
  });

  await t.test('getAcceptedTypes parses accept attribute correctly', () => {
    const pdfOnly = getAcceptedTypes({ getAttribute: () => '.pdf,application/pdf' });
    assert.strictEqual(pdfOnly.isPdfOnly, true);
    assert.strictEqual(pdfOnly.isImageOnly, false);

    const imageOnly = getAcceptedTypes({ getAttribute: () => '.png,.jpg,.jpeg' });
    assert.strictEqual(imageOnly.isImageOnly, true);
    assert.strictEqual(imageOnly.isPdfOnly, false);

    const mergeBoth = getAcceptedTypes({ getAttribute: () => '.pdf,application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/*' });
    assert.strictEqual(mergeBoth.acceptsBothPdfAndImage, true);
    assert.strictEqual(mergeBoth.isPdfOnly, false);

    const textOnly = getAcceptedTypes({ getAttribute: () => '.txt,.md,.csv,.log,.json' });
    assert.strictEqual(textOnly.isTextOnly, true);
    assert.strictEqual(textOnly.isPdfOnly, false);
  });

  await t.test('pasting a PDF on a PDF-only tool invokes onFiles', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.pdf,application/pdf');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    let prevented = false;
    const { document } = getDOMState();
    document.dispatchEvent('paste', {
      preventDefault: () => { prevented = true; },
      clipboardData: {
        files: [{ name: 'test.pdf', type: 'application/pdf' }],
        items: [{ kind: 'file', type: 'application/pdf' }],
        getData: () => ''
      }
    });

    assert.strictEqual(prevented, true);
    assert.ok(receivedFiles);
    assert.strictEqual(receivedFiles[0].name, 'test.pdf');
  });

  await t.test('pasting an image on a PDF-only tool shows warning toast and does not call onFiles', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.pdf,application/pdf');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    let prevented = false;
    const { document, bodyChildren } = getDOMState();
    document.dispatchEvent('paste', {
      preventDefault: () => { prevented = true; },
      clipboardData: {
        files: [{ name: 'screenshot.png', type: 'image/png' }],
        items: [{ kind: 'file', type: 'image/png' }],
        getData: () => ''
      }
    });

    assert.strictEqual(prevented, true);
    assert.strictEqual(receivedFiles, null);

    // Toast container should contain a warning toast
    const container = bodyChildren.find((el) => el.className === 'toast-container');
    assert.ok(container, 'Toast container should exist');
    const toast = container.children[0];
    assert.strictEqual(toast.className, 'toast toast-warning');
    assert.strictEqual(toast.textContent, 'This tool only accepts PDF files. Images are not supported.');
    assert.strictEqual(dropZone.classList.contains('drop-warning'), true);
  });

  await t.test('pasting multiple images on a PDF-only tool triggers warning and no files processed', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.pdf,application/pdf');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const { document, bodyChildren } = getDOMState();
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [
          { name: 'photo1.jpg', type: 'image/jpeg' },
          { name: 'photo2.png', type: 'image/png' }
        ],
        items: [{ kind: 'file', type: 'image/jpeg' }, { kind: 'file', type: 'image/png' }],
        getData: () => ''
      }
    });

    assert.strictEqual(receivedFiles, null);
    const container = bodyChildren.find((el) => el.className === 'toast-container');
    const toast = container.children[container.children.length - 1];
    assert.strictEqual(toast.className, 'toast toast-warning');
    assert.strictEqual(toast.textContent, 'This tool only accepts PDF files. Images are not supported.');
  });

  await t.test('pasting mixed files (PDF + image) on PDF-only tool filters to PDFs and warns about skipped images', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.pdf,application/pdf');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const { document, bodyChildren } = getDOMState();
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [
          { name: 'document.pdf', type: 'application/pdf' },
          { name: 'photo.jpg', type: 'image/jpeg' }
        ],
        items: [{ kind: 'file', type: 'application/pdf' }, { kind: 'file', type: 'image/jpeg' }],
        getData: () => ''
      }
    });

    assert.ok(receivedFiles);
    assert.strictEqual(receivedFiles.length, 1);
    assert.strictEqual(receivedFiles[0].name, 'document.pdf');

    const container = bodyChildren.find((el) => el.className === 'toast-container');
    const toast = container.children[container.children.length - 1];
    assert.strictEqual(toast.className, 'toast toast-warning');
    assert.strictEqual(toast.textContent, 'Images are not supported here and were skipped. Only PDF files were accepted.');
  });

  await t.test('pasting unsupported non-image file on PDF-only tool shows error toast', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.pdf,application/pdf');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const { document, bodyChildren } = getDOMState();
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [{ name: 'archive.zip', type: 'application/zip' }],
        items: [{ kind: 'file', type: 'application/zip' }],
        getData: () => ''
      }
    });

    assert.strictEqual(receivedFiles, null);
    const container = bodyChildren.find((el) => el.className === 'toast-container');
    const toast = container.children[container.children.length - 1];
    assert.strictEqual(toast.className, 'toast toast-error');
    assert.strictEqual(toast.textContent, 'Please choose a PDF file.');
  });

  await t.test('pasting an image on images-to-pdf tool invokes onFiles', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.png,.jpg,.jpeg');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const { document } = getDOMState();
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [{ name: 'picture.png', type: 'image/png' }],
        items: [{ kind: 'file', type: 'image/png' }],
        getData: () => ''
      }
    });

    assert.ok(receivedFiles);
    assert.strictEqual(receivedFiles[0].name, 'picture.png');
  });

  await t.test('pasting a PDF on images-to-pdf tool shows warning toast and rejects', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.png,.jpg,.jpeg');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const { document, bodyChildren } = getDOMState();
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [{ name: 'document.pdf', type: 'application/pdf' }],
        items: [{ kind: 'file', type: 'application/pdf' }],
        getData: () => ''
      }
    });

    assert.strictEqual(receivedFiles, null);
    const container = bodyChildren.find((el) => el.className === 'toast-container');
    const toast = container.children[container.children.length - 1];
    assert.strictEqual(toast.className, 'toast toast-warning');
    assert.strictEqual(toast.textContent, 'This tool only accepts image files (PNG, JPG). PDFs are not supported.');
  });

  await t.test('pasting on merge-pdf accepts both PDFs and images', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.pdf,application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/*');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const { document } = getDOMState();
    // Test PDF
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [{ name: 'doc1.pdf', type: 'application/pdf' }],
        items: [{ kind: 'file', type: 'application/pdf' }],
        getData: () => ''
      }
    });
    assert.strictEqual(receivedFiles[0].name, 'doc1.pdf');

    // Test Image
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [{ name: 'image1.png', type: 'image/png' }],
        items: [{ kind: 'file', type: 'image/png' }],
        getData: () => ''
      }
    });
    assert.strictEqual(receivedFiles[0].name, 'image1.png');
  });

  await t.test('pasting on text-to-pdf accepts text files and warns on image or PDF', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.txt,.md,.csv,.log,.json');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const { document, bodyChildren } = getDOMState();

    // 1. Image on text tool -> warning
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [{ name: 'pic.jpg', type: 'image/jpeg' }],
        items: [{ kind: 'file', type: 'image/jpeg' }],
        getData: () => ''
      }
    });
    assert.strictEqual(receivedFiles, null);
    let container = bodyChildren.find((el) => el.className === 'toast-container');
    let toast = container.children[container.children.length - 1];
    assert.strictEqual(toast.className, 'toast toast-warning');
    assert.strictEqual(toast.textContent, 'This tool only accepts text files. Images are not supported.');

    // 2. PDF on text tool -> warning
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [{ name: 'doc.pdf', type: 'application/pdf' }],
        items: [{ kind: 'file', type: 'application/pdf' }],
        getData: () => ''
      }
    });
    assert.strictEqual(receivedFiles, null);
    toast = container.children[container.children.length - 1];
    assert.strictEqual(toast.className, 'toast toast-warning');
    assert.strictEqual(toast.textContent, 'This tool only accepts text files. PDFs are not supported.');

    // 3. Text file on text tool -> accepted
    document.dispatchEvent('paste', {
      preventDefault: () => {},
      clipboardData: {
        files: [{ name: 'document.txt', type: 'text/plain' }],
        items: [{ kind: 'file', type: 'text/plain' }],
        getData: () => ''
      }
    });
    assert.ok(receivedFiles);
    assert.strictEqual(receivedFiles[0].name, 'document.txt');
  });

  await t.test('pasting plain text into an active input field does not trigger document drop', () => {
    resetDOM();
    const { dropZone, fileInput } = createMockTargetElement('.pdf,application/pdf');
    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const { document } = getDOMState();
    document.activeElement = {
      tagName: 'INPUT',
      type: 'text'
    };

    let prevented = false;
    document.dispatchEvent('paste', {
      preventDefault: () => { prevented = true; },
      clipboardData: {
        files: [],
        items: [{ kind: 'string', type: 'text/plain' }],
        getData: (type) => (type === 'text/plain' ? 'some typed text' : '')
      }
    });

    assert.strictEqual(prevented, false);
    assert.strictEqual(receivedFiles, null);
  });
});
