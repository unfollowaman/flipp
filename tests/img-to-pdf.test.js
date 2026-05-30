const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/img-to-pdf.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');

test('img-to-pdf error handling', async (t) => {
  let toastMessage = null;
  let toastType = null;
  let convertBtnHandler = null;

  const createMockElement = (id = '') => {
    const el = {
      id,
      value: '',
      style: { display: '' },
      classList: { add: () => {}, remove: () => {}, contains: () => false },
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

  const wrapper = new Function(
    'document',
    'window',
    'initDropZone',
    'showToast',
    'setProgress',
    'activatePill',
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
    elements['img-preview-area'].style.display = 'initial-preview';
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
    assert.strictEqual(elements['img-preview-area'].style.display, 'initial-preview');
    assert.strictEqual(elements['img-options'].style.display, 'initial-options');
    assert.strictEqual(elements['img-progress'].style.display, 'initial-progress');
    assert.strictEqual(elements['img-results'].style.display, 'initial-results');
  });
});
