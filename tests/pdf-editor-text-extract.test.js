const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("pdf-editor native text extraction and editing integration", async (mainSuite) => {
  const srcPath = path.join(__dirname, "../js/pdf-editor.js");
  let src = fs.readFileSync(srcPath, "utf8");

  // Strip import statements
  src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, "");
  // Strip export keywords
  src = src.replace(/export\s+const/g, "const");
  src = src.replace(/export\s+let/g, "let");
  src = src.replace(/export\s+function/g, "function");
  src = src.replace(/export\s+async\s+function/g, "async function");

  src += `\nreturn {
    handlePdfSelect,
    loadPdfFromBytes,
    switchEditorMode,
    getCurrentEditorMode,
    getExtractedDocumentData,
    getOriginalExtractedText,
    updateTextEditorStats,
    exportEditedTextPdf,
    resetEditor,
    parsePagesFromText,
    renderTextDocumentPages,
    getDocumentTextFromPages
  };\n`;

  const elementMap = {};

  function createMockElement(id = "") {
    if (id && elementMap[id]) return elementMap[id];

    const classes = new Set();
    const attributes = {};
    const listeners = {};
    const children = [];

    const el = {
      id,
      value: "",
      style: {},
      dataset: {},
      children,
      classList: {
        add: (cls) => classes.add(cls),
        remove: (cls) => classes.delete(cls),
        contains: (cls) => classes.has(cls),
      },
      setAttribute: (attr, val) => {
        attributes[attr] = String(val);
      },
      getAttribute: (attr) => attributes[attr] || null,
      appendChild: (c) => { children.push(c); },
      removeChild: (c) => {
        const idx = children.indexOf(c);
        if (idx !== -1) children.splice(idx, 1);
      },
      get innerHTML() {
        return attributes["innerHTML"] || "";
      },
      set innerHTML(val) {
        attributes["innerHTML"] = val;
        if (val === "") {
          children.length = 0;
        }
      },
      textContent: "",
      getContext: () => ({
        fillRect: () => {},
        clearRect: () => {},
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        scale: () => {},
      }),
      querySelectorAll: () => [],
      querySelector: () => createMockElement(),
      addEventListener: (evt, handler) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(handler);
      },
      trigger: (evt, args) => {
        (listeners[evt] || []).forEach((fn) => fn(args));
      },
    };

    if (id) elementMap[id] = el;
    return el;
  }

  // Pre-populate essential DOM elements
  const dropZone = createMockElement("editor-drop-zone");
  const fileInput = createMockElement("editor-file-input");
  const workspaceContainer = createMockElement("editor-workspace");
  const editorHeader = createMockElement("editor-header");
  const modeTabText = createMockElement("mode-tab-text");
  const modeTabAnnotate = createMockElement("mode-tab-annotate");
  const textWorkspace = createMockElement("editor-text-workspace");
  const annotateWorkspace = createMockElement("editor-annotate-workspace");
  const editorTextContent = createMockElement("editor-text-content");
  const textPageCount = createMockElement("text-page-count");
  const textWordCount = createMockElement("text-word-count");
  const textCharCount = createMockElement("text-char-count");
  const textEditorNotice = createMockElement("text-editor-notice");
  const exportTextPdfBtn = createMockElement("editor-export-text-pdf-btn");
  const progressArea = createMockElement("editor-progress");
  const progressBar = createMockElement("editor-progress-bar");
  const progressLabel = createMockElement("editor-progress-label");
  const resultsArea = createMockElement("editor-results");
  const downloadFinalBtn = createMockElement("editor-download-final-btn");

  const mockDocument = {
    getElementById: (id) => createMockElement(id),
    querySelectorAll: () => [],
    querySelector: () => createMockElement(),
    createElement: (tag) => createMockElement(`el-${tag}`),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: { appendChild: () => {}, removeChild: () => {} },
  };

  const toastMessages = [];
  const mockShowToast = (msg, type) => {
    toastMessages.push({ msg, type });
  };

  let mockExtractDocumentTextCalls = [];
  const mockExtractDocumentText = async (pdfDoc, onProgress) => {
    mockExtractDocumentTextCalls.push(pdfDoc);
    if (onProgress) onProgress({ current: 1, total: 1, percent: 100 });
    return {
      numPages: 1,
      isEmpty: false,
      pages: [{ pageNum: 1, text: "Sample native extracted text" }],
      fullText: "--- Page 1 ---\n\nSample native extracted text",
    };
  };

  let mockGeneratePdfCalls = [];
  const mockGeneratePdfFromText = async (content) => {
    mockGeneratePdfCalls.push(content);
    return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  };

  let revokedUrls = [];
  const mockWindow = {
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    extractDocumentText: mockExtractDocumentText,
    generatePdfFromText: mockGeneratePdfFromText,
    "pdfjs-dist/build/pdf": {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            rotate: 0,
            getViewport: () => ({ width: 600, height: 800 }),
            render: () => ({ promise: Promise.resolve() }),
            cleanup: () => {},
          }),
          destroy: async () => {},
        }),
      }),
    },
    PDFLib: {
      PDFDocument: {
        create: async () => ({
          save: async () => new Uint8Array([1, 2, 3]),
        }),
      },
    },
  };

  const wrapper = new Function(
    "document",
    "window",
    "initDropZone",
    "showToast",
    "setProgress",
    "fileToDataUrl",
    "triggerDownload",
    "hydrateIcons",
    "Blob",
    "URL",
    "console",
    "revokedUrls",
    src
  );

  const editorModule = wrapper(
    mockDocument,
    mockWindow,
    () => {},
    mockShowToast,
    () => {},
    async () => "",
    () => {},
    () => {},
    class Blob {},
    {
      createObjectURL: () => "blob:test-url",
      revokeObjectURL: (url) => revokedUrls.push(url),
    },
    console,
    revokedUrls
  );

  await mainSuite.test("loadPdfFromBytes automatically extracts native text into editor", async () => {
    editorModule.resetEditor();
    const fakeBuffer = new Uint8Array([1, 2, 3]).buffer;

    await editorModule.loadPdfFromBytes(fakeBuffer);

    assert.strictEqual(mockExtractDocumentTextCalls.length, 1);
    assert.strictEqual(editorModule.getCurrentEditorMode(), "text");
    assert.ok(editorTextContent.value.includes("Sample native extracted text"));
    assert.strictEqual(editorModule.getOriginalExtractedText(), "--- Page 1 ---\n\nSample native extracted text");
    assert.strictEqual(textPageCount.textContent, "1 Page");
  });

  await mainSuite.test("switchEditorMode toggles between text and annotate modes", () => {
    editorModule.switchEditorMode("annotate");
    assert.strictEqual(editorModule.getCurrentEditorMode(), "annotate");
    assert.strictEqual(modeTabAnnotate.getAttribute("aria-selected"), "true");
    assert.strictEqual(modeTabText.getAttribute("aria-selected"), "false");
    assert.strictEqual(textWorkspace.style.display, "none");
    assert.strictEqual(annotateWorkspace.style.display, "flex");

    editorModule.switchEditorMode("text");
    assert.strictEqual(editorModule.getCurrentEditorMode(), "text");
    assert.strictEqual(modeTabText.getAttribute("aria-selected"), "true");
    assert.strictEqual(modeTabAnnotate.getAttribute("aria-selected"), "false");
    assert.strictEqual(textWorkspace.style.display, "flex");
    assert.strictEqual(annotateWorkspace.style.display, "none");
  });

  await mainSuite.test("updateTextEditorStats accurately counts characters and words", () => {
    editorTextContent.value = "Hello world this is a test";
    editorModule.updateTextEditorStats();

    assert.ok(textWordCount.textContent.includes("6 Words"));
    assert.ok(textCharCount.textContent.includes("26 Characters"));
  });

  await mainSuite.test("exportEditedTextPdf triggers generation and prepares download", async () => {
    editorTextContent.value = "Modified text content by user";
    mockGeneratePdfCalls.length = 0;

    await editorModule.exportEditedTextPdf();

    assert.strictEqual(mockGeneratePdfCalls.length, 1);
    assert.strictEqual(mockGeneratePdfCalls[0], "Modified text content by user");
  });

  await mainSuite.test("exportEditedTextPdf rejects empty content with error toast", async () => {
    toastMessages.length = 0;
    editorTextContent.value = "   ";

    await editorModule.exportEditedTextPdf();

    assert.ok(toastMessages.some((t) => t.type === "error" && t.msg.includes("no text")));
  });

  await mainSuite.test("resetEditor clears text state and resets mode", () => {
    editorTextContent.value = "Some text";
    editorModule.resetEditor();

    assert.strictEqual(editorTextContent.value, "");
    assert.strictEqual(editorModule.getExtractedDocumentData(), null);
    assert.strictEqual(editorModule.getOriginalExtractedText(), "");
  });

  await mainSuite.test("parsePagesFromText extracts pages correctly from delimited text", () => {
    const raw = `--- Page 1 ---

First page content

--- Page 2 ---

Second page content

--- Page 3 ---

Third page content`;

    const pages = editorModule.parsePagesFromText(raw);
    assert.strictEqual(pages.length, 3);
    assert.strictEqual(pages[0].pageNum, 1);
    assert.strictEqual(pages[0].text, "First page content");
    assert.strictEqual(pages[1].pageNum, 2);
    assert.strictEqual(pages[1].text, "Second page content");
    assert.strictEqual(pages[2].pageNum, 3);
    assert.strictEqual(pages[2].text, "Third page content");
  });

  await mainSuite.test("parsePagesFromText handles single-page text without delimiters", () => {
    const raw = "Single page document without any delimiters.";
    const pages = editorModule.parsePagesFromText(raw);
    assert.strictEqual(pages.length, 1);
    assert.strictEqual(pages[0].pageNum, 1);
    assert.strictEqual(pages[0].text, "Single page document without any delimiters.");
  });

  await mainSuite.test("renderTextDocumentPages creates page sheets for all pages in container", () => {
    const pagesContainer = createMockElement("editor-text-pages-container");
    const testPages = [
      { pageNum: 1, text: "Page 1 body" },
      { pageNum: 2, text: "Page 2 body" },
      { pageNum: 3, text: "Page 3 body" },
      { pageNum: 4, text: "Page 4 body" },
      { pageNum: 5, text: "Page 5 body" }
    ];

    editorModule.renderTextDocumentPages(testPages);
    assert.strictEqual(pagesContainer.children.length, 5);
  });
});
