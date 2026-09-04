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

const elementMap = {};

const mockDocument = {
  getElementById: (id) => {
    if (!elementMap[id]) {
      const classes = new Set();
      elementMap[id] = {
        addEventListener: () => {},
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
  createElement: (tagName) => ({
    tagName,
    style: {},
    getContext: () => ({}),
    toDataURL: () => 'data:image/jpeg;base64,123'
  })
};

let toastMessages = [];
const mockShowToast = (msg, type) => {
  toastMessages.push({ msg, type });
};

const mockJsPDFInstance = {
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
      return mockJsPDFInstance;
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

const mockInitDropZone = () => {};

// Mock Blob globally for the test environment
global.Blob = class Blob {
  constructor(data, options) {
    this.data = data;
    this.options = options;
  }
};

const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'URL', 'Blob', src);

const { validatePasswords, addFiles, encryptPdf, getPdfFile, getProtectedBlob } = wrapper(
  mockDocument,
  mockWindow,
  mockInitDropZone,
  mockShowToast,
  { createObjectURL: () => '', revokeObjectURL: () => '' },
  global.Blob
);

test('validatePasswords function', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    elementMap['protect-password'].value = '';
    elementMap['protect-password-confirm'].value = '';
  });

  await t.test('returns null and shows toast if password is less than 8 characters', () => {
    elementMap['protect-password'].value = 'short';
    elementMap['protect-password-confirm'].value = 'short';

    const result = validatePasswords();

    assert.strictEqual(result, null);
    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Password must be at least 8 characters.');
    assert.strictEqual(toastMessages[0].type, 'error');
  });

  await t.test('returns null and shows toast if passwords do not match', () => {
    elementMap['protect-password'].value = 'password123';
    elementMap['protect-password-confirm'].value = 'password456';

    const result = validatePasswords();

    assert.strictEqual(result, null);
    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Passwords do not match.');
    assert.strictEqual(toastMessages[0].type, 'error');
  });

  await t.test('returns password if valid and matches', () => {
    elementMap['protect-password'].value = 'password123';
    elementMap['protect-password-confirm'].value = 'password123';

    const result = validatePasswords();

    assert.strictEqual(result, 'password123');
    assert.strictEqual(toastMessages.length, 0);
  });

  await t.test('trims whitespace from passwords', () => {
    elementMap['protect-password'].value = '  password123  ';
    elementMap['protect-password-confirm'].value = '  password123  ';

    const result = validatePasswords();

    assert.strictEqual(result, 'password123');
    assert.strictEqual(toastMessages.length, 0);
  });
});

test('addFiles function', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    elementMap['protect-preview-area'].classList.remove('is-visible');
    elementMap['protect-results'].classList.add('is-visible');
    elementMap['protect-password'].value = 'password';
    elementMap['protect-password-confirm'].value = 'password';
    elementMap['protect-info'].textContent = '';
  });

  await t.test('rejects non-PDF files and shows error toast', () => {
    const files = [{ name: 'test.txt', type: 'text/plain' }];
    addFiles(files);

    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Please add a PDF file.');
    assert.strictEqual(toastMessages[0].type, 'error');
  });

  await t.test('accepts valid PDF files and updates UI', () => {
    const files = [{ name: 'test.pdf', type: 'application/pdf' }];
    addFiles(files);

    assert.strictEqual(toastMessages.length, 0);
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

  await t.test('encrypts multi-page PDF in parallel batches maintaining page order', async () => {
    const addedPages = [];
    const addedImages = [];

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
            getPage: (pageNum) => Promise.resolve({
              getViewport: ({ scale }) => ({ width: pageNum * 10 * scale, height: pageNum * 20 * scale }),
              render: () => ({ promise: Promise.resolve() })
            })
          })
        })
      }
    };

    const customWrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'URL', 'Blob', src);
    const { encryptPdf: multiEncryptPdf } = customWrapper(
      mockDocument,
      multiPageWindow,
      mockInitDropZone,
      mockShowToast,
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      global.Blob
    );

    const dummyFile = { arrayBuffer: async () => new ArrayBuffer(8) };
    const blob = await multiEncryptPdf(dummyFile, 'password123');
    assert.ok(blob);

    // 6 pages total: page 1 sets initial size, pages 2..6 call addPage
    assert.strictEqual(addedImages.length, 6);
    // Page 1 width = 1 * 10 = 10, Page 6 width = 6 * 10 = 60
    assert.strictEqual(addedImages[0].w, 10);
    assert.strictEqual(addedImages[5].w, 60);
    // Ensure 5 additional pages added in order
    assert.strictEqual(addedPages.filter(p => p.type === 'addPage').length, 5);
  });
});
