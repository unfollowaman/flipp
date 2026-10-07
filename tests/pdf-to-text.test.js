const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('pdf-to-text box copy button and extractTextFromPage', async (t) => {
  const srcPath = path.join(__dirname, '../js/pdf-to-text.js');
  let src = fs.readFileSync(srcPath, 'utf8');

  // Strip imports and export statements for sandbox Function evaluation
  src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
  src = src.replace(/export\s+/g, '');

  await t.test('evaluateExtractionQuality signal evaluation', async () => {
    const thresholdsMatch = src.match(/const DEFAULT_QUALITY_THRESHOLDS[\s\S]*?;\n/);
    const evalQualityMatch = src.match(/function evaluateExtractionQuality[\s\S]*?\n\}/);
    assert.ok(thresholdsMatch && evalQualityMatch, 'evaluateExtractionQuality and thresholds exist');

    const evaluateExtractionQuality = new Function(
      'pageText',
      'textContent',
      'options',
      thresholdsMatch[0] + '\n' + evalQualityMatch[0] + '\nreturn evaluateExtractionQuality(pageText, textContent, options);'
    );

    // 1. Clean English text
    const cleanEngText = 'This is a standard clean English PDF document with normal sentence structure.';
    const engRes = evaluateExtractionQuality(cleanEngText);
    assert.strictEqual(engRes.isValid, true, 'Clean English text should be valid');
    assert.strictEqual(engRes.reasons.length, 0);

    // 2. Clean Hindi text
    const cleanHindiText = 'लोकतांत्रिक व्यवस्था में राजनीतिक दलों की महत्वपूर्ण भूमिका होती है। भारत एक विशाल लोकतंत्र है।';
    const hinRes = evaluateExtractionQuality(cleanHindiText);
    assert.strictEqual(hinRes.isValid, true, 'Clean Hindi text should be valid');
    assert.strictEqual(hinRes.reasons.length, 0);

    // 3. Signal 1: NUL character detection
    const nulText = 'जिससे मतदाताओं के पास \u0000ज ससे वास्तविक विकल्प कम हो गए हैं।';
    const nulRes = evaluateExtractionQuality(nulText);
    assert.strictEqual(nulRes.isValid, false);
    assert.ok(nulRes.reasons.includes('null-characters'), 'Should detect null-characters');
    assert.strictEqual(nulRes.metrics.nullCount, 1);

    // 4. Signal 1: Replacement character (\uFFFD) detection
    const replacementText = 'This contains replacement \uFFFD characters from corrupted encoding.';
    const repRes = evaluateExtractionQuality(replacementText);
    assert.strictEqual(repRes.isValid, false);
    assert.ok(repRes.reasons.includes('replacement-characters'), 'Should detect replacement-characters');
    assert.strictEqual(repRes.metrics.replacementCount, 1);

    // 5. Signal 2: Isolated Devanagari matras detection
    const isolatedMatraText = 'लोकतां ित्र क यात्र ा का संद भ';
    const matraRes = evaluateExtractionQuality(isolatedMatraText);
    assert.strictEqual(matraRes.isValid, false);
    assert.ok(matraRes.reasons.includes('isolated-devanagari-matras'), 'Should detect isolated-devanagari-matras');
    assert.ok(matraRes.metrics.isolatedMatraCount > 1);

    // 6. Signal 3: Devanagari token fragmentation detection
    const fragmentedText = 'रा ज नी ित क द लों के का म का ज को सु धा र ने के उपा य';
    const fragRes = evaluateExtractionQuality(fragmentedText);
    assert.strictEqual(fragRes.isValid, false);
    assert.ok(fragRes.reasons.includes('high-devanagari-token-fragmentation'), 'Should detect high-devanagari-token-fragmentation');
    assert.ok(fragRes.metrics.shortTokenRatio > 0.35);

    // 7. Scanned or empty text
    const scannedText = '   ';
    const scannedRes = evaluateExtractionQuality(scannedText);
    assert.strictEqual(scannedRes.isValid, false);
    assert.ok(scannedRes.reasons.includes('scanned-or-empty'));
  });

  await t.test('assets/test.pdf classification with evaluateExtractionQuality', async () => {
    const pdfjsLib = require('pdfjs-dist');
    const testPdfPath = path.join(__dirname, '../assets/test.pdf');
    assert.ok(fs.existsSync(testPdfPath), 'assets/test.pdf fixture exists');

    const data = new Uint8Array(fs.readFileSync(testPdfPath));
    const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

    const thresholdsMatch = src.match(/const DEFAULT_QUALITY_THRESHOLDS[\s\S]*?;\n/);
    const evalQualityMatch = src.match(/function evaluateExtractionQuality[\s\S]*?\n\}/);
    const evaluateExtractionQuality = new Function(
      'pageText',
      'textContent',
      'options',
      thresholdsMatch[0] + '\n' + evalQualityMatch[0] + '\nreturn evaluateExtractionQuality(pageText, textContent, options);'
    );

    let totalCorruptedPages = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      const rawText = textContent.items.map((i) => i.str).join(' ');
      const res = evaluateExtractionQuality(rawText, textContent);

      assert.strictEqual(res.isValid, false, `Page ${p} of assets/test.pdf should be classified as invalid (requiring OCR)`);
      totalCorruptedPages++;
    }

    assert.strictEqual(totalCorruptedPages, 17, 'All 17 pages of assets/test.pdf should require OCR fallback');
  });

  await t.test('extractTextFromPage identifies standard text vs OCR needed', async () => {
    const thresholdsMatch = src.match(/const DEFAULT_QUALITY_THRESHOLDS[\s\S]*?;\n/);
    const evalQualityMatch = src.match(/function evaluateExtractionQuality[\s\S]*?\n\}/);
    const extractFnMatch = src.match(/async function extractTextFromPage[\s\S]*?\n\}/);
    assert.ok(extractFnMatch, 'extractTextFromPage function exists');

    const extractTextFromPage = new Function(
      'page',
      'textContent',
      'getOcrWorker',
      thresholdsMatch[0] + '\n' + evalQualityMatch[0] + '\n' + extractFnMatch[0] + '\nreturn extractTextFromPage(page, textContent, getOcrWorker);'
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

  await t.test('handleFile cleans up page and pdfDoc resources', async () => {
    let pageCleanupCalled = false;
    let pdfDocDestroyCalled = false;

    const mockPage = {
      getTextContent: async () => ({
        items: [{ str: 'Sample page text content' }]
      }),
      cleanup: () => {
        pageCleanupCalled = true;
      }
    };

    const mockPdfDoc = {
      numPages: 1,
      getPage: async (i) => mockPage,
      destroy: async () => {
        pdfDocDestroyCalled = true;
      }
    };

    const createMockElement = (id) => ({
      id,
      value: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      innerHTML: '',
      addEventListener: () => {}
    });

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
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: (tag) => {
        if (tag === 'canvas') {
          return {
            getContext: () => ({}),
            toDataURL: () => 'data:image/png;base64,abc'
          };
        }
        return { addEventListener: () => {} };
      }
    };

    const mockWindow = {
      'pdfjs-dist/build/pdf': {
        getDocument: () => ({
          promise: Promise.resolve(mockPdfDoc)
        })
      }
    };

    const evalCode = `
      const document = mockDocument;
      const window = mockWindow;
      function initDropZone() {}
      function showToast() {}
      function setProgress() {}

      ${src}

      return handleFile;
    `;

    const handleFile = new Function('mockDocument', 'mockWindow', evalCode)(mockDocument, mockWindow);

    const mockFile = {
      type: 'application/pdf',
      name: 'test.pdf',
      arrayBuffer: async () => new ArrayBuffer(10)
    };

    await handleFile(mockFile);

    assert.strictEqual(pageCleanupCalled, true, 'page.cleanup() should be called');
    assert.strictEqual(pdfDocDestroyCalled, true, 'pdfDoc.destroy() should be called');
  });

  await t.test('handleFile handles OCR worker failure gracefully and cleans up', async () => {
    let pdfDocDestroyCalled = false;
    let workerTerminated = false;

    const mockPage = {
      getTextContent: async () => ({ items: [] }), // empty items trigger OCR
      getViewport: () => ({ width: 100, height: 100 }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: () => {}
    };

    const mockPdfDoc = {
      numPages: 1,
      getPage: async (i) => mockPage,
      destroy: async () => {
        pdfDocDestroyCalled = true;
      }
    };

    const mockWorker = {
      recognize: async () => {
        throw new Error('OCR recognition failed');
      },
      terminate: async () => {
        workerTerminated = true;
      }
    };

    const createMockElement = (id) => ({
      id,
      value: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      innerHTML: '',
      addEventListener: () => {}
    });

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
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: (tag) => {
        if (tag === 'canvas') {
          return {
            getContext: () => ({}),
            toDataURL: () => 'data:image/png;base64,abc'
          };
        }
        return { addEventListener: () => {} };
      }
    };

    const mockWindow = {
      'pdfjs-dist/build/pdf': {
        getDocument: () => ({
          promise: Promise.resolve(mockPdfDoc)
        })
      },
      Tesseract: {
        createWorker: async () => mockWorker
      }
    };

    global.document = mockDocument;

    const evalCode = `
      const window = mockWindow;
      const document = mockDocument;
      function initDropZone() {}
      function showToast(msg, type) {
        state.toastMessage = msg;
        state.toastType = type;
      }
      function setProgress() {}

      ${src}

      return handleFile;
    `;

    const state = { toastMessage: null, toastType: null };

    const handleFile = new Function('mockDocument', 'mockWindow', 'state', evalCode)(
      mockDocument,
      mockWindow,
      state
    );

    const mockFile = {
      type: 'application/pdf',
      name: 'scanned.pdf',
      arrayBuffer: async () => new ArrayBuffer(10)
    };

    await handleFile(mockFile);

    assert.strictEqual(state.toastMessage, 'Failed to process PDF');
    assert.strictEqual(state.toastType, 'error');
    assert.strictEqual(workerTerminated, true, 'OCR worker terminate should be called');
    assert.strictEqual(pdfDocDestroyCalled, true, 'pdfDoc destroy should be called');
    assert.strictEqual(elementMap['pdf-progress'].style.display, 'none');
    assert.strictEqual(elementMap['pdf-drop-zone'].style.display, 'block');
  });

  await t.test('handleFile handles page.getTextContent failure gracefully and calls page.cleanup', async () => {
    let pageCleanupCalled = false;
    let pdfDocDestroyCalled = false;

    const mockPage = {
      getTextContent: async () => {
        throw new Error('getTextContent failed');
      },
      cleanup: () => {
        pageCleanupCalled = true;
      }
    };

    const mockPdfDoc = {
      numPages: 1,
      getPage: async (i) => mockPage,
      destroy: async () => {
        pdfDocDestroyCalled = true;
      }
    };

    const createMockElement = (id) => ({
      id,
      value: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      innerHTML: '',
      addEventListener: () => {}
    });

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
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: (tag) => ({ addEventListener: () => {} })
    };

    const mockWindow = {
      'pdfjs-dist/build/pdf': {
        getDocument: () => ({
          promise: Promise.resolve(mockPdfDoc)
        })
      }
    };

    global.document = mockDocument;

    const evalCode = `
      const window = mockWindow;
      const document = mockDocument;
      function initDropZone() {}
      function showToast(msg, type) {
        state.toastMessage = msg;
        state.toastType = type;
      }
      function setProgress() {}

      ${src}

      return handleFile;
    `;

    const state = { toastMessage: null, toastType: null };

    const handleFile = new Function('mockDocument', 'mockWindow', 'state', evalCode)(
      mockDocument,
      mockWindow,
      state
    );

    const mockFile = {
      type: 'application/pdf',
      name: 'corrupt.pdf',
      arrayBuffer: async () => new ArrayBuffer(10)
    };

    await handleFile(mockFile);

    assert.strictEqual(state.toastMessage, 'Failed to process PDF');
    assert.strictEqual(state.toastType, 'error');
    assert.strictEqual(pageCleanupCalled, true, 'page.cleanup() should be called in finally block');
    assert.strictEqual(pdfDocDestroyCalled, true, 'pdfDoc destroy should be called');
    assert.strictEqual(elementMap['pdf-progress'].style.display, 'none');
    assert.strictEqual(elementMap['pdf-drop-zone'].style.display, 'block');
  });
});
