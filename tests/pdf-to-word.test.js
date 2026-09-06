import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

// Load /js/pdf-to-word.js into Node context using evaluation
const jsPath = path.resolve("./js/pdf-to-word.js");
const rawSource = fs.readFileSync(jsPath, "utf-8");

// Strip ES module imports and exports
const cleanedSource = rawSource
  .replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, "")
  .replace(/export\s+function/g, "function")
  .replace(/export\s+async\s+function/g, "async function");

const fn = new Function(`
  const window = {
    "pdfjs-dist/build/pdf": {},
    docx: {}
  };
  const document = {
    getElementById: () => null,
    readyState: "complete",
    addEventListener: () => {}
  };
  ${cleanedSource}
  return {
    sanitizeFilename,
    extractPageTextItems,
    sortAndDetectColumns,
    groupItemsIntoLines,
    groupLinesIntoParagraphs,
    detectTableStructure,
    createDocxElementsFromPageData,
    generateDocxBlobFromPdfData
  };
`);

const pdfToWordModule = fn();

describe("pdf-to-word unit and integration tests", () => {
  it("sanitizeFilename cleans and appends .docx extension correctly", () => {
    assert.strictEqual(pdfToWordModule.sanitizeFilename("report.pdf"), "report.docx");
    assert.strictEqual(pdfToWordModule.sanitizeFilename("my_document.PDF"), "my_document.docx");
    assert.strictEqual(pdfToWordModule.sanitizeFilename("path/to/file.pdf"), "path_to_file.docx");
    assert.strictEqual(pdfToWordModule.sanitizeFilename(null), "document.docx");
  });

  it("extractPageTextItems transforms PDF coordinates to top-down coordinates", () => {
    const textContent = {
      items: [
        {
          str: "Hello World",
          transform: [12, 0, 0, 12, 100, 700], // pdfY = 700
          width: 60,
          height: 12,
          fontName: "Helvetica-Bold"
        }
      ]
    };
    const viewportHeight = 842;
    const items = pdfToWordModule.extractPageTextItems(textContent, viewportHeight);

    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].str, "Hello World");
    assert.strictEqual(items[0].leftX, 100);
    assert.strictEqual(items[0].topY, 142); // 842 - 700 = 142
    assert.strictEqual(items[0].fontSize, 12);
    assert.strictEqual(items[0].isBold, true);
  });

  it("groupItemsIntoLines merges horizontal text items sharing vertical Y into single line", () => {
    const items = [
      { str: "PDF", leftX: 50, topY: 100, width: 20, height: 12, fontSize: 12 },
      { str: "to", leftX: 75, topY: 100, width: 15, height: 12, fontSize: 12 },
      { str: "Word", leftX: 95, topY: 100, width: 30, height: 12, fontSize: 12 }
    ];

    const lines = pdfToWordModule.groupItemsIntoLines(items);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].text, "PDF to Word");
  });

  it("groupLinesIntoParagraphs detects headings and paragraph breaks based on gaps and sizes", () => {
    const lines = [
      { topY: 50, fontSize: 20, isBold: true, text: "Main Title Heading", leftX: 100, items: [] },
      { topY: 100, fontSize: 12, isBold: false, text: "First paragraph sentence line 1.", leftX: 50, items: [] },
      { topY: 115, fontSize: 12, isBold: false, text: "First paragraph sentence line 2.", leftX: 50, items: [] },
      { topY: 200, fontSize: 12, isBold: false, text: "Second paragraph after gap.", leftX: 50, items: [] }
    ];

    const paragraphs = pdfToWordModule.groupLinesIntoParagraphs(lines, 595);

    assert.strictEqual(paragraphs.length, 3);
    assert.strictEqual(paragraphs[0].isHeading, true);
    assert.strictEqual(paragraphs[0].text, "Main Title Heading");
    assert.strictEqual(paragraphs[1].isHeading, false);
    assert.strictEqual(paragraphs[1].text, "First paragraph sentence line 1. First paragraph sentence line 2.");
    assert.strictEqual(paragraphs[2].text, "Second paragraph after gap.");
  });

  it("sortAndDetectColumns arranges multi-column content in reading order", () => {
    const pageWidth = 600;
    const items = [
      // Left column items
      { str: "Left Col 1", leftX: 50, topY: 100, width: 100, height: 12, fontSize: 12 },
      { str: "Left Col 2", leftX: 50, topY: 150, width: 100, height: 12, fontSize: 12 },
      // Right column items
      { str: "Right Col 1", leftX: 350, topY: 100, width: 100, height: 12, fontSize: 12 },
      { str: "Right Col 2", leftX: 350, topY: 150, width: 100, height: 12, fontSize: 12 }
    ];

    const sorted = pdfToWordModule.sortAndDetectColumns(items, pageWidth);
    assert.strictEqual(sorted.length, 4);
    assert.strictEqual(sorted[0].str, "Left Col 1");
    assert.strictEqual(sorted[1].str, "Left Col 2");
    assert.strictEqual(sorted[2].str, "Right Col 1");
    assert.strictEqual(sorted[3].str, "Right Col 2");
  });

  it("detectTableStructure identifies aligned table row cells", () => {
    const lines = [
      { items: [{ str: "Header 1" }, { str: "Header 2" }] },
      { items: [{ str: "Value 1" }, { str: "Value 2" }] }
    ];

    const table = pdfToWordModule.detectTableStructure(lines);
    assert.notStrictEqual(table, null);
    assert.strictEqual(table.length, 2);
    assert.deepStrictEqual(table[0], ["Header 1", "Header 2"]);
    assert.deepStrictEqual(table[1], ["Value 1", "Value 2"]);
  });

  it("createDocxElementsFromPageData generates valid docx element instances", () => {
    class DummyParagraph {
      constructor(opts) { this.opts = opts; }
    }
    class DummyTextRun {
      constructor(opts) { this.opts = opts; }
    }
    class DummyPageBreak {}

    const mockDocxLib = {
      Paragraph: DummyParagraph,
      TextRun: DummyTextRun,
      PageBreak: DummyPageBreak,
      HeadingLevel: { HEADING_1: "h1", HEADING_2: "h2" },
      AlignmentType: { LEFT: "left", CENTER: "center", RIGHT: "right" }
    };

    const pageData = {
      pageNum: 2,
      totalPages: 2,
      paragraphs: [
        { text: "Heading Text", isHeading: true, headingLevel: "HEADING_1" },
        { text: "Normal paragraph text.", isHeading: false, alignment: "LEFT", fontSize: 12, isBold: false, isItalic: false }
      ]
    };

    const elements = pdfToWordModule.createDocxElementsFromPageData(pageData, mockDocxLib);
    // Expect PageBreak for page 2 + heading + paragraph = 3 elements
    assert.strictEqual(elements.length, 3);
    assert.ok(elements[0] instanceof DummyParagraph);
  });
});
