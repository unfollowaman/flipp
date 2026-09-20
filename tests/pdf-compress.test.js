const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-compress.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
// Strip export keywords
src = src.replace(/export\s+(async\s+)?(function|class)/g, '$1$2');

// To extract formatBytes and mapConcurrent functions we can append a return statement
src += '\nreturn { formatBytes, createDownloadButton, updateProgress, mapConcurrent };\n';

const elementMap = {};

const mockDocument = {
  getElementById: (id) => {
    if (!elementMap[id]) {
      elementMap[id] = {
        addEventListener: () => {},
        style: {},
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        value: '',
        textContent: ''
      };
    }
    return elementMap[id];
  },
  getElementsByName: () => [{ addEventListener: () => {} }],
  querySelector: () => ({ value: '' }),
  createElement: (tagName) => ({
    tagName,
    style: {},
    addEventListener: () => {},
    appendChild: function(child) {
      if (!this.children) this.children = [];
      this.children.push(child);
    }
  }),
  createTextNode: (text) => ({ textNode: true, textContent: text })
};

const mockWindow = {};
const mockInitDropZone = () => {};
const mockShowToast = () => {};

const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'Blob', 'URL', src);

// Evaluate and get functions
const { formatBytes, createDownloadButton, updateProgress, mapConcurrent } = wrapper(
  mockDocument,
  mockWindow,
  mockInitDropZone,
  mockShowToast,
  class Blob {},
  { createObjectURL: () => 'blob:mock-url', revokeObjectURL: () => '' }
);

test('formatBytes function', async (t) => {
  await t.test('handles 0 bytes', () => {
    assert.strictEqual(formatBytes(0), '0 Bytes');
  });

  await t.test('handles bytes under 1 KB', () => {
    assert.strictEqual(formatBytes(500), '500 Bytes');
    assert.strictEqual(formatBytes(1023), '1023 Bytes');
  });

  await t.test('handles KB', () => {
    assert.strictEqual(formatBytes(1024), '1 KB');
    assert.strictEqual(formatBytes(1536), '1.5 KB'); // 1.5 * 1024
  });

  await t.test('handles MB', () => {
    assert.strictEqual(formatBytes(1048576), '1 MB'); // 1024 * 1024
    assert.strictEqual(formatBytes(1572864), '1.5 MB'); // 1.5 * 1024 * 1024
  });

  await t.test('handles GB', () => {
    assert.strictEqual(formatBytes(1073741824), '1 GB'); // 1024^3
  });

  await t.test('handles TB', () => {
    assert.strictEqual(formatBytes(1099511627776), '1 TB'); // 1024^4
  });

  await t.test('respects decimals parameter', () => {
    assert.strictEqual(formatBytes(1536, 0), '2 KB'); // 1.5 rounds to 2 with 0 decimals
    assert.strictEqual(formatBytes(1536, 1), '1.5 KB');
    assert.strictEqual(formatBytes(1536, 3), '1.5 KB'); // parseFloat removes trailing zeros
  });

  await t.test('handles negative decimals as 0', () => {
    assert.strictEqual(formatBytes(1536, -1), '2 KB');
  });
});

test('createDownloadButton function', async (t) => {
  await t.test('creates download button with correct properties', () => {
    const mockBlob = new Blob(['mock content']);
    const filename = 'test-file.pdf';
    const label = 'test-file.pdf';

    const btn = createDownloadButton(mockBlob, filename, label);

    assert.strictEqual(btn.tagName, 'a');
    assert.strictEqual(btn.href, 'blob:mock-url');
    assert.strictEqual(btn.download, filename);
    assert.strictEqual(btn.className, 'cta-btn cta-mint');

    assert.strictEqual(btn.children.length, 2);

    const icon = btn.children[0];
    assert.strictEqual(icon.tagName, 'img');
    assert.strictEqual(icon.src, '/assets/icons/download--v2.png');
    assert.strictEqual(icon.alt, 'download');
    assert.strictEqual(icon.width, 16);
    assert.strictEqual(icon.height, 16);
    assert.strictEqual(icon.style.verticalAlign, 'middle');
    assert.strictEqual(icon.style.marginRight, '4px');

    const textNode = btn.children[1];
    assert.strictEqual(textNode.textNode, true);
    assert.strictEqual(textNode.textContent, ' Download test-file.pdf');
  });
});

test('updateProgress function', async (t) => {
  await t.test('updates the text content of progressText', () => {
    const progressTextElement = elementMap['compress-progress-text'];
    progressTextElement.textContent = ''; // Reset before test

    updateProgress('Compressing...');

    assert.strictEqual(progressTextElement.textContent, 'Compressing...');
  });
});

test('mapConcurrent function', async (t) => {
  await t.test('handles empty input array', async () => {
    const results = await mapConcurrent([], 5, async (x) => x * 2);
    assert.deepStrictEqual(results, []);
  });

  await t.test('preserves input order when completion times differ', async () => {
    const items = [100, 10, 50, 5, 20];
    const results = await mapConcurrent(items, 3, async (ms, idx) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { idx, val: ms * 2 };
    });

    assert.deepStrictEqual(results, [
      { idx: 0, val: 200 },
      { idx: 1, val: 20 },
      { idx: 2, val: 100 },
      { idx: 3, val: 10 },
      { idx: 4, val: 40 }
    ]);
  });

  await t.test('enforces concurrency limit', async () => {
    let activeCount = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapConcurrent(items, 3, async () => {
      activeCount++;
      if (activeCount > maxActive) maxActive = activeCount;
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeCount--;
    });

    assert.strictEqual(maxActive, 3, 'Max active concurrent workers should not exceed limit');
  });
});

test('pdf-compress error handling', async (t) => {
  await t.test('shows error toast when PDFLib is unavailable on compress click', async () => {
    let capturedToastMessage = '';
    let capturedToastType = '';
    const mockShowToastLocal = (msg, type) => {
      capturedToastMessage = msg;
      capturedToastType = type;
    };

    const localElementMap = {};
    const mockDocumentLocal = {
      getElementById: (id) => {
        if (!localElementMap[id]) {
          localElementMap[id] = {
            listeners: {},
            addEventListener: function(evt, handler) {
              this.listeners[evt] = handler;
            },
            click: function() {
              if (this.listeners['click']) this.listeners['click']();
            },
            style: {},
            classList: { add: () => {}, remove: () => {} },
            appendChild: () => {},
            value: '',
            textContent: ''
          };
        }
        return localElementMap[id];
      },
      getElementsByName: () => [{ addEventListener: () => {} }],
      querySelector: (selector) => {
        if (selector.includes('compressionMode')) return { value: 'recommended' };
        return { value: '' };
      },
      createElement: () => ({ addEventListener: () => {}, appendChild: () => {} }),
      createTextNode: (text) => ({ textNode: true, textContent: text })
    };

    let dropZoneCallback;
    const mockInitDropZoneLocal = (dz, fi, cb) => {
      dropZoneCallback = cb;
    };

    const mockWindowLocal = {}; // PDFLib is undefined on window

    let localSrc = fs.readFileSync(srcPath, 'utf8');
    localSrc = localSrc.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
    localSrc = localSrc.replace(/export\s+(async\s+)?(function|class)/g, '$1$2');

    const localWrapper = new Function(
      'document',
      'window',
      'initDropZone',
      'showToast',
      'Blob',
      'URL',
      localSrc
    );

    localWrapper(
      mockDocumentLocal,
      mockWindowLocal,
      mockInitDropZoneLocal,
      mockShowToastLocal,
      class Blob {},
      { createObjectURL: () => 'blob:mock-url', revokeObjectURL: () => '' }
    );

    // Simulate selecting a valid file via drop zone
    const mockFile = {
      type: 'application/pdf',
      name: 'test.pdf',
      size: 1024,
      arrayBuffer: async () => new ArrayBuffer(8)
    };
    dropZoneCallback([mockFile]);

    // Click compress button
    const compressBtnLocal = localElementMap['compress-btn'];
    await compressBtnLocal.click();

    assert.strictEqual(capturedToastMessage, 'PDF library not ready yet.');
    assert.strictEqual(capturedToastType, 'error');
  });

  await t.test('calls page.cleanup() and pdfjsDoc.destroy() during maximum compression mode', async () => {
    let pageCleanupCalled = false;
    let docDestroyCalled = false;

    const localElementMap = {};
    const mockDocumentLocal = {
      getElementById: (id) => {
        if (!localElementMap[id]) {
          localElementMap[id] = {
            listeners: {},
            addEventListener: function(evt, handler) {
              this.listeners[evt] = handler;
            },
            click: async function() {
              if (this.listeners['click']) await this.listeners['click']();
            },
            style: {},
            classList: { add: () => {}, remove: () => {} },
            appendChild: () => {},
            value: '',
            textContent: ''
          };
        }
        return localElementMap[id];
      },
      getElementsByName: () => [{ addEventListener: () => {} }],
      querySelector: (selector) => {
        if (selector.includes('compressionMode')) return { value: 'maximum' };
        return { value: '' };
      },
      createElement: () => ({
        getContext: () => ({ fillRect: () => {} }),
        toDataURL: () => 'data:image/jpeg;base64,mock',
        addEventListener: () => {},
        appendChild: () => {}
      }),
      createTextNode: (text) => ({ textNode: true, textContent: text })
    };

    let dropZoneCallback;
    const mockInitDropZoneLocal = (dz, fi, cb) => {
      dropZoneCallback = cb;
    };

    const mockPdfjsDoc = {
      numPages: 1,
      getPage: async (pageNum) => ({
        getViewport: () => ({ width: 100, height: 100 }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: () => {
          pageCleanupCalled = true;
        }
      }),
      destroy: async () => {
        docDestroyCalled = true;
      }
    };

    const mockWindowLocal = {
      'pdfjs-dist/build/pdf': {
        getDocument: () => ({ promise: Promise.resolve(mockPdfjsDoc) })
      },
      jspdf: {
        jsPDF: function() {
          return {
            internal: { pageSize: { setWidth: () => {}, setHeight: () => {} } },
            setPage: () => {},
            addImage: () => {},
            output: () => new ArrayBuffer(10)
          };
        }
      }
    };

    let localSrc = fs.readFileSync(srcPath, 'utf8');
    localSrc = localSrc.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
    localSrc = localSrc.replace(/export\s+(async\s+)?(function|class)/g, '$1$2');

    const localWrapper = new Function(
      'document',
      'window',
      'initDropZone',
      'showToast',
      'Blob',
      'URL',
      localSrc
    );

    localWrapper(
      mockDocumentLocal,
      mockWindowLocal,
      mockInitDropZoneLocal,
      () => {},
      class Blob {
        constructor(content) {
          this.content = content;
        }
        async arrayBuffer() {
          return new ArrayBuffer(10);
        }
      },
      { createObjectURL: () => 'blob:mock-url', revokeObjectURL: () => '' }
    );

    const mockFile = {
      type: 'application/pdf',
      name: 'test.pdf',
      size: 1024,
      arrayBuffer: async () => new ArrayBuffer(8)
    };
    dropZoneCallback([mockFile]);

    const compressBtnLocal = localElementMap['compress-btn'];
    await compressBtnLocal.click();

    assert.strictEqual(pageCleanupCalled, true, 'page.cleanup() should be called');
    assert.strictEqual(docDestroyCalled, true, 'pdfjsDoc.destroy() should be called');
  });
});
