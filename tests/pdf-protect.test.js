const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-protect.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
// Strip export keywords
src = src.replace(/export\s+function/g, 'function');

src += '\nreturn { validatePasswords, addFiles, encryptPdf, getPdfFile: () => pdfFile, getProtectedBlob: () => protectedBlob };\n';

// Mock Blob globally for the test environment
global.Blob = class Blob {
  constructor(data, options) {
    this.data = data;
    this.options = options;
  }
};

function createTestInstance(customWindowOverrides = {}) {
  const elementMap = {};
  const toastMessages = [];
  const mockShowToast = (msg, type) => {
    toastMessages.push({ msg, type });
  };

  let createdElements = [];

  const mockDocument = {
    getElementById: (id) => {
      if (!elementMap[id]) {
        const classes = new Set();
        const listeners = {};
        elementMap[id] = {
          listeners,
          addEventListener: (event, handler) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
          },
          click: async function() {
            if (listeners['click']) {
              for (const fn of listeners['click']) {
                await fn();
              }
            }
          },
          style: {},
          classList: {
            add: (cls) => classes.add(cls),
            remove: (cls) => classes.delete(cls),
            contains: (cls) => classes.has(cls)
          },
          appendChild: () => {},
          value: '',
          textContent: '',
          disabled: false
        };
      }
      return elementMap[id];
    },
    createElement: (tagName) => {
      const el = {
        tagName,
        style: {},
        getContext: () => ({}),
        toDataURL: () => 'data:image/jpeg;base64,123',
        clickCount: 0,
        click: function() {
          this.clickCount++;
        }
      };
      createdElements.push(el);
      return el;
    }
  };

  const defaultJsPDFInstance = {
    internal: {
      pageSize: {
        setWidth: () => {},
        setHeight: () => {}
      }
    },
    addPage: () => {},
    addImage: () => {},
    output: () => new global.Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' })
  };

  const mockWindow = {
    jspdf: {
      jsPDF: function(options) {
        this.options = options;
        return defaultJsPDFInstance;
      }
    },
    "pdfjs-dist/build/pdf": {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () => Promise.resolve({
            getViewport: ({ scale }) => ({ width: 100 * scale, height: 100 * scale }),
            render: () => ({ promise: Promise.resolve() })
          })
        })
      })
    },
    ...customWindowOverrides
  };

  let dropZoneCallback = null;
  const mockInitDropZone = (dz, fi, cb) => {
    dropZoneCallback = cb;
  };

  let createdUrl = null;
  let revokedUrl = null;
  const mockURL = {
    createObjectURL: (blob) => {
      createdUrl = 'blob:mock-protected-pdf';
      return createdUrl;
    },
    revokeObjectURL: (url) => {
      revokedUrl = url;
    }
  };

  const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'URL', 'Blob', src);
  const exportsObj = wrapper(
    mockDocument,
    mockWindow,
    mockInitDropZone,
    mockShowToast,
    mockURL,
    global.Blob
  );

  return {
    elementMap,
    toastMessages,
    dropZoneCallback,
    mockWindow,
    exportsObj,
    createdElements,
    getCreatedUrl: () => createdUrl,
    getRevokedUrl: () => revokedUrl
  };
}

// Global default instance for top-level helper unit tests
const defaultInstance = createTestInstance();
const { validatePasswords, addFiles, encryptPdf, getPdfFile, getProtectedBlob } = defaultInstance.exportsObj;
const { elementMap } = defaultInstance;

test('validatePasswords function', async (t) => {
  t.beforeEach(() => {
    defaultInstance.toastMessages.length = 0;
    elementMap['protect-password'].value = '';
    elementMap['protect-password-confirm'].value = '';
  });

  await t.test('returns null and shows toast if password is less than 8 characters', () => {
    elementMap['protect-password'].value = 'short';
    elementMap['protect-password-confirm'].value = 'short';

    const result = validatePasswords();

    assert.strictEqual(result, null);
    assert.strictEqual(defaultInstance.toastMessages.length, 1);
    assert.strictEqual(defaultInstance.toastMessages[0].msg, 'Password must be at least 8 characters.');
    assert.strictEqual(defaultInstance.toastMessages[0].type, 'error');
  });

  await t.test('returns null and shows toast if passwords do not match', () => {
    elementMap['protect-password'].value = 'password123';
    elementMap['protect-password-confirm'].value = 'password456';

    const result = validatePasswords();

    assert.strictEqual(result, null);
    assert.strictEqual(defaultInstance.toastMessages.length, 1);
    assert.strictEqual(defaultInstance.toastMessages[0].msg, 'Passwords do not match.');
    assert.strictEqual(defaultInstance.toastMessages[0].type, 'error');
  });

  await t.test('returns password if valid and matches', () => {
    elementMap['protect-password'].value = 'password123';
    elementMap['protect-password-confirm'].value = 'password123';

    const result = validatePasswords();

    assert.strictEqual(result, 'password123');
    assert.strictEqual(defaultInstance.toastMessages.length, 0);
  });

  await t.test('trims whitespace from passwords', () => {
    elementMap['protect-password'].value = '  password123  ';
    elementMap['protect-password-confirm'].value = '  password123  ';

    const result = validatePasswords();

    assert.strictEqual(result, 'password123');
    assert.strictEqual(defaultInstance.toastMessages.length, 0);
  });
});

test('addFiles function', async (t) => {
  t.beforeEach(() => {
    defaultInstance.toastMessages.length = 0;
    elementMap['protect-preview-area'].classList.remove('is-visible');
    elementMap['protect-results'].classList.add('is-visible');
    elementMap['protect-password'].value = 'password';
    elementMap['protect-password-confirm'].value = 'password';
    elementMap['protect-info'].textContent = '';
  });

  await t.test('rejects non-PDF files and shows error toast', () => {
    const files = [{ name: 'test.txt', type: 'text/plain' }];
    addFiles(files);

    assert.strictEqual(defaultInstance.toastMessages.length, 1);
    assert.strictEqual(defaultInstance.toastMessages[0].msg, 'Please add a PDF file.');
    assert.strictEqual(defaultInstance.toastMessages[0].type, 'error');
  });

  await t.test('accepts valid PDF files and updates UI', () => {
    const files = [{ name: 'test.pdf', type: 'application/pdf' }];
    addFiles(files);

    assert.strictEqual(defaultInstance.toastMessages.length, 0);
    assert.strictEqual(getPdfFile(), files[0]);
    assert.strictEqual(getProtectedBlob(), null);
    assert.strictEqual(elementMap['protect-preview-area'].classList.contains('is-visible'), true);
    assert.strictEqual(elementMap['protect-results'].classList.contains('is-visible'), false);
    assert.strictEqual(elementMap['protect-password'].value, '');
    assert.strictEqual(elementMap['protect-password-confirm'].value, '');
    assert.strictEqual(elementMap['protect-info'].textContent, 'Selected: test.pdf');
  });
});

test('encryptPdf function', async (t) => {
  await t.test('encrypts PDF using PDF.js and jsPDF', async () => {
    const dummyFile = {
      arrayBuffer: async () => new ArrayBuffer(8)
    };
    const blob = await encryptPdf(dummyFile, 'password123');
    assert.ok(blob);
  });

  await t.test('rejects when getDocument promise rejects', async () => {
    const errorWindow = {
      jspdf: {
        jsPDF: function(options) {
          this.options = options;
          return {
            internal: { pageSize: { setWidth: () => {}, setHeight: () => {} } },
            addPage: () => {},
            addImage: () => {},
            output: () => new global.Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' })
          };
        }
      },
      "pdfjs-dist/build/pdf": {
        getDocument: () => ({
          promise: Promise.reject(new Error("Failed to parse PDF document"))
        })
      }
    };

    const instance = createTestInstance(errorWindow);
    const dummyFile = { arrayBuffer: async () => new ArrayBuffer(8) };
    await assert.rejects(
      async () => {
        await instance.exportsObj.encryptPdf(dummyFile, 'password123');
      },
      {
        name: 'Error',
        message: 'Failed to parse PDF document'
      }
    );
  });

  await t.test('encrypts multi-page PDF in parallel batches maintaining page order', async () => {
    const addedPages = [];
    const addedImages = [];
    let cleanupCallCount = 0;
    let destroyCalled = false;

    const customJsPDFInstance = {
      internal: {
        pageSize: {
          setWidth: (w) => { addedPages.push({ type: 'firstPageWidth', w }); },
          setHeight: (h) => { addedPages.push({ type: 'firstPageHeight', h }); }
        }
      },
      addPage: (dim, orientation) => { addedPages.push({ type: 'addPage', dim, orientation }); },
      addImage: (imgData, format, x, y, w, h) => { addedImages.push({ imgData, format, x, y, w, h }); },
      output: () => new global.Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' })
    };

    const multiPageWindow = {
      jspdf: {
        jsPDF: function(options) {
          this.options = options;
          return customJsPDFInstance;
        }
      },
      "pdfjs-dist/build/pdf": {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 6,
            destroy: () => { destroyCalled = true; },
            getPage: (pageNum) => Promise.resolve({
              getViewport: ({ scale }) => ({ width: pageNum * 10 * scale, height: pageNum * 20 * scale }),
              render: () => ({ promise: Promise.resolve() }),
              cleanup: () => { cleanupCallCount++; }
            })
          })
        })
      }
    };

    const instance = createTestInstance(multiPageWindow);
    const dummyFile = { arrayBuffer: async () => new ArrayBuffer(8) };
    const blob = await instance.exportsObj.encryptPdf(dummyFile, 'password123');
    assert.ok(blob);

    // 6 pages total: page 1 sets initial size, pages 2..6 call addPage
    assert.strictEqual(addedImages.length, 6);
    // Page 1 width = 1 * 10 = 10, Page 6 width = 6 * 10 = 60
    assert.strictEqual(addedImages[0].w, 10);
    assert.strictEqual(addedImages[5].w, 60);
    // Ensure 5 additional pages added in order
    assert.strictEqual(addedPages.filter(p => p.type === 'addPage').length, 5);
    // Verify resource cleanup
    assert.strictEqual(cleanupCallCount, 6);
    assert.strictEqual(destroyCalled, true);
  });
});

test('protectBtn click handling and error paths', async (t) => {
  await t.test('shows error toast if no PDF file is selected', async () => {
    const inst = createTestInstance();
    await inst.elementMap['protect-btn'].click();

    assert.strictEqual(inst.toastMessages.length, 1);
    assert.strictEqual(inst.toastMessages[0].msg, 'Please select a PDF first.');
    assert.strictEqual(inst.toastMessages[0].type, 'error');
  });

  await t.test('shows error toast if passwords validation fails', async () => {
    const inst = createTestInstance();
    const mockFile = { name: 'test.pdf', type: 'application/pdf' };
    inst.exportsObj.addFiles([mockFile]);
    inst.toastMessages.length = 0; // Clear addFiles toasts if any

    inst.elementMap['protect-password'].value = 'short';
    inst.elementMap['protect-password-confirm'].value = 'short';

    await inst.elementMap['protect-btn'].click();

    assert.strictEqual(inst.toastMessages.length, 1);
    assert.strictEqual(inst.toastMessages[0].msg, 'Password must be at least 8 characters.');
    assert.strictEqual(inst.toastMessages[0].type, 'error');
  });

  await t.test('shows error toast if PDF libraries are not loaded', async () => {
    const inst = createTestInstance({ "pdfjs-dist/build/pdf": null });
    const mockFile = { name: 'test.pdf', type: 'application/pdf' };
    inst.exportsObj.addFiles([mockFile]);
    inst.toastMessages.length = 0;

    inst.elementMap['protect-password'].value = 'password123';
    inst.elementMap['protect-password-confirm'].value = 'password123';

    await inst.elementMap['protect-btn'].click();

    assert.strictEqual(inst.toastMessages.length, 1);
    assert.strictEqual(inst.toastMessages[0].msg, 'PDF library is still loading. Please try again in a moment.');
    assert.strictEqual(inst.toastMessages[0].type, 'error');
  });

  await t.test('handles encryption failure, displays error toast, and restores button state', async () => {
    const failingWindow = {
      jspdf: {
        jsPDF: function() {
          return {
            internal: { pageSize: { setWidth: () => {}, setHeight: () => {} } },
            addPage: () => {},
            addImage: () => {},
            output: () => { throw new Error('Encryption output failed'); }
          };
        }
      },
      "pdfjs-dist/build/pdf": {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: () => Promise.resolve({
              getViewport: ({ scale }) => ({ width: 100 * scale, height: 100 * scale }),
              render: () => ({ promise: Promise.resolve() })
            })
          })
        })
      }
    };

    const inst = createTestInstance(failingWindow);
    const mockFile = { name: 'test.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(8) };
    inst.exportsObj.addFiles([mockFile]);
    inst.toastMessages.length = 0;

    inst.elementMap['protect-password'].value = 'password123';
    inst.elementMap['protect-password-confirm'].value = 'password123';

    const protectBtn = inst.elementMap['protect-btn'];
    await protectBtn.click();

    assert.strictEqual(inst.toastMessages.length, 1);
    assert.strictEqual(inst.toastMessages[0].msg, 'Failed to protect PDF. Try another file.');
    assert.strictEqual(inst.toastMessages[0].type, 'error');

    // Verify button state restored in finally block
    assert.strictEqual(protectBtn.disabled, false);
    assert.strictEqual(protectBtn.textContent, 'Protect PDF →');

    // Verify results area was not made visible
    assert.strictEqual(inst.elementMap['protect-results'].classList.contains('is-visible'), false);
  });

  await t.test('handles successful protection on protectBtn click', async () => {
    const inst = createTestInstance();
    const mockFile = { name: 'sample.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(8) };
    inst.exportsObj.addFiles([mockFile]);
    inst.toastMessages.length = 0;

    inst.elementMap['protect-password'].value = 'password123';
    inst.elementMap['protect-password-confirm'].value = 'password123';

    const protectBtn = inst.elementMap['protect-btn'];
    await protectBtn.click();

    assert.strictEqual(inst.toastMessages.length, 1);
    assert.strictEqual(inst.toastMessages[0].msg, 'Protected PDF is ready!');

    assert.strictEqual(inst.elementMap['protect-preview-area'].classList.contains('is-visible'), false);
    assert.strictEqual(inst.elementMap['protect-results'].classList.contains('is-visible'), true);

    assert.strictEqual(protectBtn.disabled, false);
    assert.strictEqual(protectBtn.textContent, 'Protect PDF →');
    assert.ok(inst.exportsObj.getProtectedBlob());
  });

  await t.test('downloadBtn click downloads protected file', async () => {
    const inst = createTestInstance();
    const mockFile = { name: 'sample.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(8) };
    inst.exportsObj.addFiles([mockFile]);
    inst.elementMap['protect-password'].value = 'password123';
    inst.elementMap['protect-password-confirm'].value = 'password123';

    await inst.elementMap['protect-btn'].click();

    await inst.elementMap['protect-download-btn'].click();

    const downloadedAnchor = inst.createdElements.find(el => el.tagName === 'a');
    assert.ok(downloadedAnchor);
    assert.strictEqual(downloadedAnchor.download, 'sample-protected.pdf');
    assert.strictEqual(downloadedAnchor.href, 'blob:mock-protected-pdf');
    assert.strictEqual(downloadedAnchor.clickCount, 1);
    assert.strictEqual(inst.getRevokedUrl(), 'blob:mock-protected-pdf');
  });

  await t.test('resetBtn click resets UI state and selection', async () => {
    const inst = createTestInstance();
    const mockFile = { name: 'sample.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(8) };
    inst.exportsObj.addFiles([mockFile]);
    inst.elementMap['protect-password'].value = 'password123';
    inst.elementMap['protect-password-confirm'].value = 'password123';

    await inst.elementMap['protect-btn'].click();

    await inst.elementMap['protect-reset-btn'].click();

    assert.strictEqual(inst.exportsObj.getPdfFile(), null);
    assert.strictEqual(inst.exportsObj.getProtectedBlob(), null);
    assert.strictEqual(inst.elementMap['protect-preview-area'].classList.contains('is-visible'), false);
    assert.strictEqual(inst.elementMap['protect-results'].classList.contains('is-visible'), false);
    assert.strictEqual(inst.elementMap['protect-info'].textContent, '');
    assert.strictEqual(inst.elementMap['protect-password'].value, '');
    assert.strictEqual(inst.elementMap['protect-password-confirm'].value, '');
  });
});
