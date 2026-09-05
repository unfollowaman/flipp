const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('pdf-to-text box copy button and extractTextFromPage', async (t) => {
  const srcPath = path.join(__dirname, '../js/pdf-to-text.js');
  let src = fs.readFileSync(srcPath, 'utf8');

  // Strip imports
  src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

  await t.test('extractTextFromPage identifies standard text vs OCR needed', async () => {
    // Evaluate extractTextFromPage function
    const extractFnMatch = src.match(/async function extractTextFromPage[\s\S]*?\n\}/);
    assert.ok(extractFnMatch, 'extractTextFromPage function exists');

    const extractTextFromPage = new Function(
      'page',
      'textContent',
      'getOcrWorker',
      extractFnMatch[0] + '\nreturn extractTextFromPage(page, textContent, getOcrWorker);'
    );

    // Mock page and textContent for standard text
    const samplePage = {};
    const textContentStandard = {
      items: [{ str: 'Hello' }, { str: 'world' }, { str: 'this' }, { str: 'is' }, { str: 'a' }, { str: 'sample' }, { str: 'pdf' }, { str: 'document' }]
    };

    const resStandard = await extractTextFromPage(samplePage, textContentStandard, null);
    assert.strictEqual(resStandard.usedOcr, false);
    assert.strictEqual(resStandard.text, 'Hello world this is a sample pdf document');

    // Mock page and textContent for empty / scanned document
    const textContentScanned = { items: [] };
    const mockWorker = {
      recognize: async () => ({ data: { text: 'OCR extracted text' } })
    };
    const mockCanvas = {
      getContext: () => ({}),
      toDataURL: () => 'data:image/png;base64,abc'
    };
    const mockPageScanned = {
      getViewport: () => ({ width: 100, height: 100 }),
      render: () => ({ promise: Promise.resolve() })
    };

    // Override document.createElement in small sandbox if needed
    global.document = global.document || {};
    const origCreateElement = global.document.createElement;
    global.document.createElement = (tag) => {
      if (tag === 'canvas') return mockCanvas;
      return { addEventListener: () => {} };
    };

    const resScanned = await extractTextFromPage(mockPageScanned, textContentScanned, () => Promise.resolve(mockWorker));
    assert.strictEqual(resScanned.usedOcr, true);
    assert.strictEqual(resScanned.text, 'OCR extracted text');

    if (origCreateElement) {
      global.document.createElement = origCreateElement;
    }
  });

  await t.test('copyText handler updates boxCopyBtn state and copies text', async () => {
    let copiedText = null;
    let toastMsg = null;

    const createMockElement = (id) => {
      const classes = new Set();
      const listeners = {};
      const el = {
        id,
        value: id === 'pdf-text-output' ? 'Sample extracted text content' : '',
        style: {},
        classes,
        classList: {
          add: (cls) => { classes.add(cls); },
          remove: (cls) => { classes.delete(cls); },
          contains: (cls) => classes.has(cls)
        },
        innerHTML: '',
        addEventListener: (event, fn) => { listeners[event] = fn; },
        click: () => { if (listeners['click']) listeners['click'](); },
        listeners
      };
      return el;
    };

    const elementMap = {
      'pdf-drop-zone': createMockElement('pdf-drop-zone'),
      'pdf-file-input': createMockElement('pdf-file-input'),
      'pdf-progress': createMockElement('pdf-progress'),
      'pdf-progress-bar': createMockElement('pdf-progress-bar'),
      'pdf-progress-label': createMockElement('pdf-progress-label'),
      'pdf-results': createMockElement('pdf-results'),
      'pdf-text-output': createMockElement('pdf-text-output'),
      'ocr-notice': createMockElement('ocr-notice'),
      'pdf-copy-btn': createMockElement('pdf-copy-btn'),
      'pdf-box-copy-btn': createMockElement('pdf-box-copy-btn'),
      'pdf-download-btn': createMockElement('pdf-download-btn'),
      'pdf-reset-btn': createMockElement('pdf-reset-btn')
    };

    const mockDocument = {
      getElementById: (id) => elementMap[id] || createMockElement(id),
      body: { appendChild: () => {}, removeChild: () => {} }
    };

    const mockNavigator = {
      clipboard: {
        writeText: async (text) => {
          copiedText = text;
          return Promise.resolve();
        }
      }
    };

    const evalCode = `
      const document = mockDocument;
      const navigator = mockNavigator;
      function initDropZone() {}
      function showToast(msg) { toastMsg = msg; }
      function setProgress() {}

      ${src}
    `;

    const runner = new Function('mockDocument', 'mockNavigator', 'copiedText', 'toastMsg', evalCode);
    runner(mockDocument, mockNavigator, copiedText, toastMsg);

    // Trigger box copy button click
    const boxBtn = elementMap['pdf-box-copy-btn'];
    boxBtn.click();

    // Wait for clipboard promise resolution
    await new Promise((r) => setTimeout(r, 50));

    assert.strictEqual(copiedText, 'Sample extracted text content');
    assert.strictEqual(boxBtn.classes.has('copied'), true);

    // Wait for timeout reset (1500ms) to finish cleanly in test
    await new Promise((r) => setTimeout(r, 1600));
    assert.strictEqual(boxBtn.classes.has('copied'), false);
  });
});
