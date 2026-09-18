const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const srcPath = path.join(__dirname, "../js/unlock-pdf.js");
let src = fs.readFileSync(srcPath, "utf8");

// Remove import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, "");

function createTestInstance(customPdfLib = {}) {
  let dropZoneDisplay = "block";
  let previewAreaClasses = new Set();
  let resultsAreaClasses = new Set();
  let passwordGroupDisplay = "none";
  let errorMsgDisplay = "none";
  let infoText = "";
  let toastMsg = null;
  let toastType = null;
  let clickedDownloadUrl = null;
  let clickedDownloadName = null;

  let dropZoneCb = null;
  const mockInitDropZone = (dz, fi, cb) => {
    dropZoneCb = cb;
  };

  const mockShowToast = (msg, type) => {
    toastMsg = msg;
    toastType = type;
  };

  const elements = {
    "unlock-drop-zone": {
      style: {
        get display() { return dropZoneDisplay; },
        set display(v) { dropZoneDisplay = v; }
      }
    },
    "unlock-preview-area": {
      classList: {
        add: (c) => previewAreaClasses.add(c),
        remove: (c) => previewAreaClasses.delete(c),
        contains: (c) => previewAreaClasses.has(c)
      }
    },
    "unlock-results": {
      classList: {
        add: (c) => resultsAreaClasses.add(c),
        remove: (c) => resultsAreaClasses.delete(c),
        contains: (c) => resultsAreaClasses.has(c)
      }
    },
    "unlock-info": {
      get textContent() { return infoText; },
      set textContent(v) { infoText = v; }
    },
    "unlock-password-group": {
      style: {
        get display() { return passwordGroupDisplay; },
        set display(v) { passwordGroupDisplay = v; }
      }
    },
    "unlock-error": {
      style: {
        get display() { return errorMsgDisplay; },
        set display(v) { errorMsgDisplay = v; }
      }
    },
    "unlock-password": {
      value: "",
      focused: false,
      focus() { this.focused = true; }
    },
    "unlock-btn": {
      disabled: false,
      textContent: "Unlock PDF →",
      listeners: {},
      addEventListener(evt, cb) {
        this.listeners[evt] = cb;
      },
      click: async function() {
        if (this.listeners["click"]) await this.listeners["click"]();
      }
    },
    "unlock-download-btn": {
      onclick: null,
      click: async function() {
        if (this.onclick) await this.onclick();
      }
    },
    "unlock-reset-btn": {
      listeners: {},
      addEventListener(evt, cb) {
        this.listeners[evt] = cb;
      },
      click: async function() {
        if (this.listeners["click"]) await this.listeners["click"]();
      }
    },
    "unlock-file-input": {}
  };

  const mockDocument = {
    getElementById: (id) => elements[id],
    createElement: (tag) => {
      if (tag === "a") {
        return {
          href: "",
          download: "",
          click: function() {
            clickedDownloadUrl = this.href;
            clickedDownloadName = this.download;
          }
        };
      }
      return {};
    },
    body: {
      appendChild: () => {},
      removeChild: () => {}
    }
  };

  let createdUrls = [];
  let revokedUrls = [];

  const mockURL = {
    createObjectURL: (blob) => {
      const url = `blob:test-url-${createdUrls.length + 1}`;
      createdUrls.push(url);
      return url;
    },
    revokeObjectURL: (url) => {
      revokedUrls.push(url);
    }
  };

  class MockBlob {
    constructor(data, options) {
      this.data = data;
      this.options = options;
    }
  }

  const defaultPDFLib = {
    PDFDocument: {
      load: async (bytes, options) => {
        return {
          isEncrypted: false,
          getPageIndices: () => [0]
        };
      },
      create: async () => {
        return {
          copyPages: async (doc, indices) => indices.map(i => ({ index: i })),
          addPage: () => {},
          save: async () => new Uint8Array([1, 2, 3])
        };
      }
    }
  };

  const mockWindow = {
    PDFLib: customPdfLib.PDFDocument ? customPdfLib : defaultPDFLib
  };

  const evaluate = new Function(
    "document",
    "window",
    "initDropZone",
    "showToast",
    "URL",
    "Blob",
    "setTimeout",
    src
  );

  evaluate(
    mockDocument,
    mockWindow,
    mockInitDropZone,
    mockShowToast,
    mockURL,
    MockBlob,
    setTimeout
  );

  return {
    elements,
    mockDocument,
    mockWindow,
    getDropZoneCb: () => dropZoneCb,
    getToastMsg: () => toastMsg,
    getToastType: () => toastType,
    getClickedDownloadUrl: () => clickedDownloadUrl,
    getClickedDownloadName: () => clickedDownloadName,
    getCreatedUrls: () => createdUrls,
    getRevokedUrls: () => revokedUrls,
    getDropZoneDisplay: () => dropZoneDisplay,
    getPreviewAreaClasses: () => previewAreaClasses,
    getResultsAreaClasses: () => resultsAreaClasses,
    getPasswordGroupDisplay: () => passwordGroupDisplay,
    getErrorMsgDisplay: () => errorMsgDisplay,
    getInfoText: () => infoText
  };
}

test("Unlock PDF logic handles non-PDF files", async () => {
  const inst = createTestInstance();
  const cb = inst.getDropZoneCb();

  await cb([{ name: "test.txt", type: "text/plain" }]);
  assert.strictEqual(inst.getToastMsg(), "Please select a PDF file.");
});

test("Unlock PDF logic handles unprotected PDFs", async () => {
  const inst = createTestInstance();
  const cb = inst.getDropZoneCb();

  await cb([{
    name: "normal.pdf",
    type: "application/pdf",
    arrayBuffer: async () => new ArrayBuffer(16)
  }]);

  assert.strictEqual(inst.getToastMsg(), "This PDF is not password protected.");
  assert.strictEqual(inst.getDropZoneDisplay(), "block");
  assert.strictEqual(inst.getPreviewAreaClasses().has("is-visible"), false);
});

test("Unlock PDF logic handles PDFs requiring open password", async () => {
  const mockPdfLib = {
    PDFDocument: {
      load: async (bytes, options) => {
        if (options && options.ignoreEncryption) {
          if (options.password) {
            if (options.password === "correct-pass") {
              return {
                isEncrypted: true,
                getPageIndices: () => [0, 1]
              };
            }
            throw new Error("EncryptedPDFError: Incorrect password");
          }
          return {
            isEncrypted: true,
            getPageIndices: () => [0, 1]
          };
        }
        // Without ignoreEncryption, throw encrypted password error
        throw new Error("EncryptedPDFError: Document is password encrypted");
      },
      create: async () => {
        return {
          copyPages: async (doc, indices) => indices.map(i => ({ index: i })),
          addPage: () => {},
          save: async () => new Uint8Array([1, 2, 3])
        };
      }
    }
  };

  const inst = createTestInstance(mockPdfLib);
  const cb = inst.getDropZoneCb();

  await cb([{
    name: "protected.pdf",
    type: "application/pdf",
    arrayBuffer: async () => new ArrayBuffer(16)
  }]);

  assert.strictEqual(inst.getDropZoneDisplay(), "none");
  assert.strictEqual(inst.getPreviewAreaClasses().has("is-visible"), true);
  assert.strictEqual(inst.getInfoText(), "Ready to unlock: protected.pdf");
  assert.strictEqual(inst.getPasswordGroupDisplay(), "block");
  assert.strictEqual(inst.elements["unlock-password"].focused, true);

  // 1. Try wrong password
  inst.elements["unlock-password"].value = "wrong-pass";
  await inst.elements["unlock-btn"].click();

  assert.strictEqual(inst.getErrorMsgDisplay(), "block");
  assert.strictEqual(inst.elements["unlock-btn"].disabled, false);
  assert.strictEqual(inst.elements["unlock-btn"].textContent, "Unlock PDF →");

  // 2. Try correct password
  inst.elements["unlock-password"].value = "correct-pass";
  await inst.elements["unlock-btn"].click();

  assert.strictEqual(inst.getPreviewAreaClasses().has("is-visible"), false);
  assert.strictEqual(inst.getResultsAreaClasses().has("is-visible"), true);

  // 3. Test download
  await inst.elements["unlock-download-btn"].click();
  assert.strictEqual(inst.getClickedDownloadName(), "unlocked_protected.pdf");
  assert.ok(inst.getClickedDownloadUrl().startsWith("blob:test-url-"));

  // 4. Test reset
  await inst.elements["unlock-reset-btn"].click();
  assert.strictEqual(inst.getDropZoneDisplay(), "block");
  assert.strictEqual(inst.getPreviewAreaClasses().has("is-visible"), false);
  assert.strictEqual(inst.getResultsAreaClasses().has("is-visible"), false);
});

test("Unlock PDF logic handles PDFs with owner restrictions only (no open password)", async () => {
  const mockPdfLib = {
    PDFDocument: {
      load: async (bytes, options) => {
        if (options && options.ignoreEncryption) {
          return {
            isEncrypted: true,
            getPageIndices: () => [0]
          };
        }
        // Without ignoreEncryption, succeeds for owner-restricted PDFs
        return {
          isEncrypted: true,
          getPageIndices: () => [0]
        };
      },
      create: async () => {
        return {
          copyPages: async (doc, indices) => indices.map(i => ({ index: i })),
          addPage: () => {},
          save: async () => new Uint8Array([1, 2, 3])
        };
      }
    }
  };

  const inst = createTestInstance(mockPdfLib);
  const cb = inst.getDropZoneCb();

  await cb([{
    name: "owner-restricted.pdf",
    type: "application/pdf",
    arrayBuffer: async () => new ArrayBuffer(16)
  }]);

  assert.strictEqual(inst.getDropZoneDisplay(), "none");
  assert.strictEqual(inst.getPreviewAreaClasses().has("is-visible"), true);
  assert.strictEqual(inst.getPasswordGroupDisplay(), "none");

  // Unlock directly
  await inst.elements["unlock-btn"].click();

  assert.strictEqual(inst.getResultsAreaClasses().has("is-visible"), true);
});

test("Unlock PDF logic handles file reading error", async () => {
  const mockPdfLib = {
    PDFDocument: {
      load: async () => {
        throw new Error("Corrupt PDF file");
      }
    }
  };

  const inst = createTestInstance(mockPdfLib);
  const cb = inst.getDropZoneCb();

  await cb([{
    name: "corrupt.pdf",
    type: "application/pdf",
    arrayBuffer: async () => new ArrayBuffer(16)
  }]);

  assert.strictEqual(inst.getToastMsg(), "Failed to read PDF. It might be corrupted.");
});

test("Unlock PDF logic handles process error during unlocking", async () => {
  const mockPdfLib = {
    PDFDocument: {
      load: async (bytes, options) => {
        return {
          isEncrypted: true,
          getPageIndices: () => [0]
        };
      },
      create: async () => {
        throw new Error("Failed to copy pages");
      }
    }
  };

  const inst = createTestInstance(mockPdfLib);
  const cb = inst.getDropZoneCb();

  await cb([{
    name: "owner-restricted.pdf",
    type: "application/pdf",
    arrayBuffer: async () => new ArrayBuffer(16)
  }]);

  await inst.elements["unlock-btn"].click();

  assert.strictEqual(inst.getToastMsg(), "An error occurred while unlocking the PDF.");
  assert.strictEqual(inst.elements["unlock-btn"].disabled, false);
  assert.strictEqual(inst.elements["unlock-btn"].textContent, "Unlock PDF →");
});
