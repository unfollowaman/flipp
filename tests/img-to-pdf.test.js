const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/img-to-pdf.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

// Expose internal functions
src += '\nreturn { addImageFiles, resetImgConverter, showResults, getImageDimensions, calculatePageDimensions, calculateImageDrawDimensions };\n';

test('img-to-pdf error handling', async (t) => {
  let toastMessage = null;
  let toastType = null;
  let convertBtnHandler = null;

  const createMockElement = (id = '') => {
    const el = {
      id,
      value: '',
      style: { display: '' },
      classList: (() => {
        let classes = [];
        return {
          add: (c) => { if(!classes.includes(c)) classes.push(c); },
          remove: (c) => { classes = classes.filter(x => x !== c); },
          contains: (c) => classes.includes(c)
        };
      })(),
      appendChild: () => {},
      innerHTML: '',
      textContent: '',
      dataset: {},
      addEventListener: (event, handler) => {
        if (id === 'img-convert-btn' && event === 'click') {
          convertBtnHandler = handler;
        }
      },
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      getAttribute: () => null,
      setAttribute: () => {},
      removeAttribute: () => {},
      closest: () => null
    };
    return el;
  };

  const mockWindow = {};
  const mockInitDropZone = () => {};
  const mockShowToast = (msg, type) => {
    toastMessage = msg;
    toastType = type;
  };
  const mockSetProgress = () => {};
  const mockActivatePill = () => {};
  const mockSetupDragReorder = () => {};

  const wrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setProgress',
    'activatePill',
    'setupDragReorder',
    'Blob',
    'URL',
    'FileReader',
    'Image',
    src
  );

  await t.test('returns early without modifying DOM when no images are added', async () => {
    toastMessage = null;
    toastType = null;
    convertBtnHandler = null;

    // Create elements that retain their reference to check styles
    const elements = {
        'img-convert-btn': createMockElement('img-convert-btn'),
        'img-preview-area': createMockElement('img-preview-area'),
        'img-options': createMockElement('img-options'),
        'img-progress': createMockElement('img-progress'),
        'img-results': createMockElement('img-results'),
        // Just mocking the rest to avoid undefined errors
        'img-drop-zone': createMockElement('img-drop-zone'),
        'img-file-input': createMockElement('img-file-input'),
        'img-size-pills': createMockElement('img-size-pills'),
        'img-orient-pills': createMockElement('img-orient-pills'),
        'img-filename-input': createMockElement('img-filename-input'),
        'img-file-count': createMockElement('img-file-count'),
        'img-add-more-btn': createMockElement('img-add-more-btn'),
        'img-preview-grid': createMockElement('img-preview-grid'),
        'img-progress-bar': createMockElement('img-progress-bar'),
        'img-progress-label': createMockElement('img-progress-label'),
        'img-download-btn': createMockElement('img-download-btn'),
        'img-result-info': createMockElement('img-result-info'),
        'img-reset-btn': createMockElement('img-reset-btn'),
    };

    // set initial states that we can verify weren't changed
    elements['img-preview-area'].classList.add("is-visible");
    elements['img-options'].style.display = 'initial-options';
    elements['img-progress'].style.display = 'initial-progress';
    elements['img-results'].style.display = 'initial-results';

    const localMockDocument = {
      getElementById: (id) => {
        return elements[id] || createMockElement(id);
      },
      createElement: () => createMockElement()
    };

    // Initialize wrapper with our custom document
    wrapper(
      localMockDocument,
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetProgress,
      mockActivatePill,
      mockSetupDragReorder,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      class FileReader {},
      class Image {}
    );

    // Ensure the handler was registered
    assert.ok(convertBtnHandler, 'Convert button click handler should be registered');

    // Trigger the convert button
    await convertBtnHandler();

    // Assert that the styles were NOT modified, because imageFiles is empty
    // and it should have returned early.
    assert.strictEqual(elements['img-preview-area'].classList.contains("is-visible"), true);
    assert.strictEqual(elements['img-options'].style.display, 'initial-options');
    assert.strictEqual(elements['img-progress'].style.display, 'initial-progress');
    assert.strictEqual(elements['img-results'].style.display, 'initial-results');
  });

  await t.test('showResults builds DOM without innerHTML assignment and safely displays content', async () => {
    const appendedNodes = [];
    const mockResultInfo = createMockElement('img-result-info');
    mockResultInfo.append = (...nodes) => {
      appendedNodes.push(...nodes);
    };

    const elements = {
        'img-convert-btn': createMockElement('img-convert-btn'),
        'img-preview-area': createMockElement('img-preview-area'),
        'img-options': createMockElement('img-options'),
        'img-progress': createMockElement('img-progress'),
        'img-results': createMockElement('img-results'),
        'img-drop-zone': createMockElement('img-drop-zone'),
        'img-file-input': createMockElement('img-file-input'),
        'img-size-pills': createMockElement('img-size-pills'),
        'img-orient-pills': createMockElement('img-orient-pills'),
        'img-filename-input': createMockElement('img-filename-input'),
        'img-file-count': createMockElement('img-file-count'),
        'img-add-more-btn': createMockElement('img-add-more-btn'),
        'img-preview-grid': createMockElement('img-preview-grid'),
        'img-progress-bar': createMockElement('img-progress-bar'),
        'img-progress-label': createMockElement('img-progress-label'),
        'img-download-btn': createMockElement('img-download-btn'),
        'img-result-info': mockResultInfo,
        'img-reset-btn': createMockElement('img-reset-btn'),
    };

    elements['img-filename-input'].value = '<script>alert("xss")</script>.pdf';

    const localMockDocument = {
      getElementById: (id) => elements[id] || createMockElement(id),
      createElement: (tag) => {
        const el = createMockElement(tag);
        el.tagName = tag.toUpperCase();
        return el;
      },
      createDocumentFragment: () => createMockElement()
    };

    const { showResults } = wrapper(
      localMockDocument,
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetProgress,
      mockActivatePill,
      mockSetupDragReorder,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      class FileReader {},
      class Image {}
    );

    // Set mock pdfBlob in scope before calling showResults
    const mockBlob = { size: 1048576 };
    // Trigger showResults when pdfBlob is present
    const testWrapper = new Function(
      'document',
      'window',
      'initDropZone',
      'showToast',
      'setProgress',
      'activatePill',
      'setupDragReorder',
      'Blob',
      'URL',
      'FileReader',
      'Image',
      src.replace('function showResults(pageCount) {', 'pdfBlob = { size: 1048576 };\nfunction showResults(pageCount) {')
    );

    const { showResults: showResultsWithBlob } = testWrapper(
      localMockDocument,
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetProgress,
      mockActivatePill,
      mockSetupDragReorder,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      class FileReader {},
      class Image {}
    );

    showResultsWithBlob(3);

    assert.ok(elements['img-results'].classList.contains('is-visible'));
    assert.strictEqual(appendedNodes.length, 9);

    // Check filename element
    const filenameNode = appendedNodes.find(n => n.id === 'img-result-filename');
    assert.ok(filenameNode, 'Filename span should be constructed');
    assert.strictEqual(filenameNode.textContent, '<script>alert("xss")</script>.pdf');
  });

  await t.test('properly formats pluralization for single vs multiple images', async () => {
    const elements = {
        'img-convert-btn': createMockElement('img-convert-btn'),
        'img-preview-area': createMockElement('img-preview-area'),
        'img-options': createMockElement('img-options'),
        'img-progress': createMockElement('img-progress'),
        'img-results': createMockElement('img-results'),
        'img-drop-zone': createMockElement('img-drop-zone'),
        'img-file-input': createMockElement('img-file-input'),
        'img-size-pills': createMockElement('img-size-pills'),
        'img-orient-pills': createMockElement('img-orient-pills'),
        'img-filename-input': createMockElement('img-filename-input'),
        'img-file-count': createMockElement('img-file-count'),
        'img-add-more-btn': createMockElement('img-add-more-btn'),
        'img-preview-grid': createMockElement('img-preview-grid'),
        'img-progress-bar': createMockElement('img-progress-bar'),
        'img-progress-label': createMockElement('img-progress-label'),
        'img-download-btn': createMockElement('img-download-btn'),
        'img-result-info': createMockElement('img-result-info'),
        'img-reset-btn': createMockElement('img-reset-btn'),
    };

    const localMockDocument = {
      getElementById: (id) => elements[id] || createMockElement(id),
      createElement: () => createMockElement(),
      createDocumentFragment: () => createMockElement()
    };

    const { addImageFiles, resetImgConverter } = wrapper(
      localMockDocument,
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetProgress,
      mockActivatePill,
      mockSetupDragReorder,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      class FileReader {},
      class Image {}
    );

    // Ensure state is clean
    resetImgConverter();

    // Test single image pluralization
    const singleFile = { name: 'test1.jpg', type: 'image/jpeg' };
    addImageFiles([singleFile]);
    assert.strictEqual(
      elements['img-file-count'].textContent,
      '1 image selected',
      'Should not be plural for exactly 1 image'
    );

    // Ensure state is clean before next test
    resetImgConverter();

    // Test multiple images pluralization
    const multipleFiles = [
      { name: 'test1.jpg', type: 'image/jpeg' },
      { name: 'test2.png', type: 'image/png' }
    ];
    addImageFiles(multipleFiles);
    assert.strictEqual(
      elements['img-file-count'].textContent,
      '2 images selected',
      'Should be plural for more than 1 image'
    );
  });

  await t.test('getImageDimensions resolves image natural dimensions correctly', async () => {
    class MockImage {
      constructor() {
        this.naturalWidth = 1920;
        this.naturalHeight = 1080;
      }
      set src(url) {
        this._src = url;
        if (typeof this.onload === 'function') {
          setTimeout(() => this.onload(), 0);
        }
      }
      get src() {
        return this._src;
      }
    }

    const { getImageDimensions } = wrapper(
      { getElementById: createMockElement, createElement: createMockElement },
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetProgress,
      mockActivatePill,
      mockSetupDragReorder,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      class FileReader {},
      MockImage
    );

    const dimensions = await getImageDimensions('data:image/png;base64,mock');
    assert.deepStrictEqual(dimensions, { w: 1920, h: 1080 });
  });

  await t.test('calculatePageDimensions calculates correct page dimensions for auto, a4, and letter page sizes', () => {
    const { calculatePageDimensions } = wrapper(
      { getElementById: createMockElement, createElement: createMockElement },
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetProgress,
      mockActivatePill,
      mockSetupDragReorder,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      class FileReader {},
      class Image {}
    );

    // Auto page size converts pixels to mm assuming 96 DPI (1px = 0.264583mm)
    const autoResult = calculatePageDimensions(1000, 500, 'auto', 'portrait');
    assert.strictEqual(autoResult.docW, 1000 * 0.264583);
    assert.strictEqual(autoResult.docH, 500 * 0.264583);

    // Auto page size ignores orientation option
    const autoLandscape = calculatePageDimensions(1000, 500, 'auto', 'landscape');
    assert.strictEqual(autoLandscape.docW, 1000 * 0.264583);
    assert.strictEqual(autoLandscape.docH, 500 * 0.264583);

    // A4 portrait
    const a4Portrait = calculatePageDimensions(800, 600, 'a4', 'portrait');
    assert.deepStrictEqual(a4Portrait, { docW: 210, docH: 297 });

    // A4 landscape
    const a4Landscape = calculatePageDimensions(800, 600, 'a4', 'landscape');
    assert.deepStrictEqual(a4Landscape, { docW: 297, docH: 210 });

    // Letter portrait
    const letterPortrait = calculatePageDimensions(800, 600, 'letter', 'portrait');
    assert.deepStrictEqual(letterPortrait, { docW: 215.9, docH: 279.4 });

    // Letter landscape
    const letterLandscape = calculatePageDimensions(800, 600, 'letter', 'landscape');
    assert.deepStrictEqual(letterLandscape, { docW: 279.4, docH: 215.9 });
  });

  await t.test('calculateImageDrawDimensions calculates correct draw coordinates and scaling for auto and fixed page sizes', () => {
    const { calculateImageDrawDimensions } = wrapper(
      { getElementById: createMockElement, createElement: createMockElement },
      mockWindow,
      mockInitDropZone,
      mockShowToast,
      mockSetProgress,
      mockActivatePill,
      mockSetupDragReorder,
      class Blob {},
      { createObjectURL: () => '', revokeObjectURL: () => '' },
      class FileReader {},
      class Image {}
    );

    // Auto page size: draw dimensions match doc dimensions with zero offset
    const autoDraw = calculateImageDrawDimensions(800, 600, 211.6664, 158.7498, 'auto');
    assert.deepStrictEqual(autoDraw, { imgX: 0, imgY: 0, drawW: 211.6664, drawH: 158.7498 });

    // A4 portrait (docW: 210, docH: 297) with a wide image (1900 x 950)
    // Usable area = 190 x 277 (margin 10mm). ratio = min(190/1900, 277/950) = min(0.1, 0.2915789) = 0.1
    // drawW = 190, drawH = 95, imgX = 10, imgY = 10 + (277 - 95)/2 = 101
    const fixedDrawWide = calculateImageDrawDimensions(1900, 950, 210, 297, 'a4');
    assert.strictEqual(fixedDrawWide.drawW, 190);
    assert.strictEqual(fixedDrawWide.drawH, 95);
    assert.strictEqual(fixedDrawWide.imgX, 10);
    assert.strictEqual(fixedDrawWide.imgY, 101);

    // A4 portrait (docW: 210, docH: 297) with a tall image (500 x 2770)
    // Usable area = 190 x 277. ratio = min(190/500, 277/2770) = min(0.38, 0.1) = 0.1
    // drawW = 50, drawH = 277, imgX = 10 + (190 - 50)/2 = 80, imgY = 10
    const fixedDrawTall = calculateImageDrawDimensions(500, 2770, 210, 297, 'a4');
    assert.strictEqual(fixedDrawTall.drawW, 50);
    assert.strictEqual(fixedDrawTall.drawH, 277);
    assert.strictEqual(fixedDrawTall.imgX, 80);
    assert.strictEqual(fixedDrawTall.imgY, 10);
  });
});
