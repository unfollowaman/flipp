const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("native-text-extractor suite", async (mainSuite) => {
  const {
    convertPdfPointToViewport,
    extractPageTextItems,
    sortAndDetectReadingOrder,
    groupItemsIntoLines,
    groupLinesIntoParagraphs,
    extractSinglePage,
    extractDocumentText,
    sanitizeForPdfFont,
    generatePdfFromText,
  } = await import("../js/native-text-extractor.js");

  await mainSuite.test("convertPdfPointToViewport coordinate transformation", async (t) => {
    await t.test("uses viewport.convertToViewportPoint when available", () => {
      const mockViewport = {
        convertToViewportPoint: (x, y) => [x + 10, y + 20],
        width: 600,
        height: 800,
      };
      const res = convertPdfPointToViewport(50, 100, mockViewport, 0);
      assert.deepStrictEqual(res, [60, 120]);
    });

    await t.test("calculates fallback top-down coordinates for 0 degree rotation", () => {
      const mockViewport = { width: 595, height: 842 };
      const res = convertPdfPointToViewport(100, 200, mockViewport, 0);
      assert.deepStrictEqual(res, [100, 642]); // 842 - 200 = 642
    });

    await t.test("calculates fallback coordinates for 90 degree rotation", () => {
      const mockViewport = { width: 842, height: 595 };
      const res = convertPdfPointToViewport(100, 200, mockViewport, 90);
      assert.deepStrictEqual(res, [200, 100]);
    });

    await t.test("calculates fallback coordinates for 180 degree rotation", () => {
      const mockViewport = { width: 595, height: 842 };
      const res = convertPdfPointToViewport(100, 200, mockViewport, 180);
      assert.deepStrictEqual(res, [495, 200]); // 595 - 100 = 495
    });

    await t.test("calculates fallback coordinates for 270 degree rotation", () => {
      const mockViewport = { width: 842, height: 595 };
      const res = convertPdfPointToViewport(100, 200, mockViewport, 270);
      assert.deepStrictEqual(res, [642, 495]); // 842 - 200 = 642, 595 - 100 = 495
    });
  });

  await mainSuite.test("extractPageTextItems extraction and matrix normalization", async (t) => {
    await t.test("extracts text items, font sizes, matrix transform, and bold/italic flags", () => {
      const textContent = {
        items: [
          {
            str: "Heading Title",
            transform: [18, 0, 0, 18, 54, 750],
            width: 120,
            height: 18,
            fontName: "Helvetica-Bold",
          },
          {
            str: "Italic note",
            transform: [12, 0, 0, 12, 54, 720],
            width: 80,
            height: 12,
            fontName: "Helvetica-Oblique",
          },
          {
            str: "   ", // whitespace only, should be skipped
            transform: [12, 0, 0, 12, 54, 700],
          },
        ],
      };
      const viewport = {
        width: 595,
        height: 842,
        convertToViewportPoint: (x, y) => [x, 842 - y],
      };

      const items = extractPageTextItems(textContent, viewport, 0);

      assert.strictEqual(items.length, 2);

      assert.strictEqual(items[0].str, "Heading Title");
      assert.strictEqual(items[0].fontSize, 18);
      assert.strictEqual(items[0].isBold, true);
      assert.strictEqual(items[0].isItalic, false);
      assert.strictEqual(items[0].leftX, 54);
      assert.strictEqual(items[0].topY, 842 - 750 - 18);

      assert.strictEqual(items[1].str, "Italic note");
      assert.strictEqual(items[1].fontSize, 12);
      assert.strictEqual(items[1].isBold, false);
      assert.strictEqual(items[1].isItalic, true);
    });

    await t.test("handles empty or invalid textContent gracefully", () => {
      assert.deepStrictEqual(extractPageTextItems(null, null), []);
      assert.deepStrictEqual(extractPageTextItems({}, null), []);
      assert.deepStrictEqual(extractPageTextItems({ items: [] }, null), []);
    });

    await t.test("correctly calculates font size for condensed fonts using vertical matrix scale", () => {
      const textContent = {
        items: [
          {
            str: "Condensed Text",
            transform: [6, 0, 0, 14, 54, 700], // sx=6, sy=14
            width: 80,
            height: 14,
            fontName: "Condensed-Font",
          },
        ],
      };
      const viewport = {
        width: 595,
        height: 842,
        convertToViewportPoint: (x, y) => [x, 842 - y],
      };
      const items = extractPageTextItems(textContent, viewport, 0);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].fontSize, 14);
    });

    await t.test("identifies malformed NUL characters, records warnings, and replaces with fallback glyph", () => {
      const textContent = {
        items: [
          {
            str: "Malformed \u0000text\u0000 sample",
            transform: [12, 0, 0, 12, 54, 700],
            width: 100,
            height: 12,
            fontName: "Regular",
          },
        ],
      };
      const viewport = {
        width: 595,
        height: 842,
        convertToViewportPoint: (x, y) => [x, 842 - y],
      };
      const items = extractPageTextItems(textContent, viewport, 0);
      assert.strictEqual(items.length, 1);
      assert.ok(items[0].str.includes("\uFFFD"));
      assert.ok(!items[0].str.includes("\u0000"));
      assert.strictEqual(items.warnings.hasMalformedGlyphs, true);
      assert.strictEqual(items.warnings.malformedCount, 2);
    });
  });

  await mainSuite.test("sortAndDetectReadingOrder multi-column and single-column sorting", async (t) => {
    await t.test("preserves reading order for two-column layout", () => {
      const pageWidth = 600;
      const items = [
        // Left column
        { str: "Left 1", leftX: 50, topY: 100, width: 150 },
        { str: "Left 2", leftX: 50, topY: 150, width: 150 },
        // Right column
        { str: "Right 1", leftX: 350, topY: 100, width: 150 },
        { str: "Right 2", leftX: 350, topY: 150, width: 150 },
      ];

      const sorted = sortAndDetectReadingOrder(items, pageWidth);
      assert.strictEqual(sorted.length, 4);
      assert.strictEqual(sorted[0].str, "Left 1");
      assert.strictEqual(sorted[1].str, "Left 2");
      assert.strictEqual(sorted[2].str, "Right 1");
      assert.strictEqual(sorted[3].str, "Right 2");
    });

    await t.test("sorts single-column items top-to-bottom", () => {
      const items = [
        { str: "Line 2", leftX: 50, topY: 120, width: 100 },
        { str: "Line 1", leftX: 50, topY: 80, width: 100 },
        { str: "Line 3", leftX: 50, topY: 160, width: 100 },
      ];
      const sorted = sortAndDetectReadingOrder(items, 600);
      assert.strictEqual(sorted[0].str, "Line 1");
      assert.strictEqual(sorted[1].str, "Line 2");
      assert.strictEqual(sorted[2].str, "Line 3");
    });

    await t.test("preserves reading order for three-column layout (Col 1 -> Col 2 -> Col 3)", () => {
      const pageWidth = 600;
      const items = [
        // Column 1
        { str: "Col 1 Line 1", leftX: 40, topY: 100, width: 120 },
        { str: "Col 1 Line 2", leftX: 40, topY: 140, width: 120 },
        // Column 2
        { str: "Col 2 Line 1", leftX: 230, topY: 100, width: 120 },
        { str: "Col 2 Line 2", leftX: 230, topY: 140, width: 120 },
        // Column 3
        { str: "Col 3 Line 1", leftX: 420, topY: 100, width: 120 },
        { str: "Col 3 Line 2", leftX: 420, topY: 140, width: 120 },
      ];

      const sorted = sortAndDetectReadingOrder(items, pageWidth);
      assert.strictEqual(sorted.length, 6);
      assert.strictEqual(sorted[0].str, "Col 1 Line 1");
      assert.strictEqual(sorted[1].str, "Col 1 Line 2");
      assert.strictEqual(sorted[2].str, "Col 2 Line 1");
      assert.strictEqual(sorted[3].str, "Col 2 Line 2");
      assert.strictEqual(sorted[4].str, "Col 3 Line 1");
      assert.strictEqual(sorted[5].str, "Col 3 Line 2");
    });

    await t.test("handles mid-page section headings spanning across columns without dumping to bottom", () => {
      const pageWidth = 600;
      const items = [
        // Full width header
        { str: "Main Document Title", leftX: 50, topY: 50, width: 500, fontSize: 18 },
        // Top 2-column block
        { str: "Top Col 1", leftX: 50, topY: 100, width: 180, fontSize: 11 },
        { str: "Top Col 2", leftX: 340, topY: 100, width: 180, fontSize: 11 },
        // Mid-page heading
        { str: "Mid-Page Section Heading", leftX: 50, topY: 200, width: 500, fontSize: 15 },
        // Bottom 2-column block
        { str: "Bottom Col 1", leftX: 50, topY: 260, width: 180, fontSize: 11 },
        { str: "Bottom Col 2", leftX: 340, topY: 260, width: 180, fontSize: 11 },
      ];

      const sorted = sortAndDetectReadingOrder(items, pageWidth);
      assert.strictEqual(sorted.length, 6);
      assert.strictEqual(sorted[0].str, "Main Document Title");
      assert.strictEqual(sorted[1].str, "Top Col 1");
      assert.strictEqual(sorted[2].str, "Top Col 2");
      assert.strictEqual(sorted[3].str, "Mid-Page Section Heading");
      assert.strictEqual(sorted[4].str, "Bottom Col 1");
      assert.strictEqual(sorted[5].str, "Bottom Col 2");
    });
  });

  await mainSuite.test("groupItemsIntoLines word spacing and positional line reconstruction", async (t) => {
    await t.test("groups horizontal items into a line and reconstructs spaces", () => {
      const items = [
        { str: "Native", leftX: 50, topY: 100, width: 40, fontSize: 12 },
        { str: "PDF", leftX: 98, topY: 101, width: 25, fontSize: 12 }, // gap = 98 - (50+40) = 8 (> 2.4) -> space
        { str: "Extraction", leftX: 130, topY: 99.5, width: 70, fontSize: 12 },
      ];

      const lines = groupItemsIntoLines(items);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].text, "Native PDF Extraction");
    });

    await t.test("does not insert extra space when item already has trailing space or gap is small", () => {
      const items = [
        { str: "Hello ", leftX: 50, topY: 100, width: 40, fontSize: 12 },
        { str: "World", leftX: 92, topY: 100, width: 35, fontSize: 12 },
      ];
      const lines = groupItemsIntoLines(items);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].text, "Hello World");
    });

    await t.test("separates lines with distinct vertical positions", () => {
      const items = [
        { str: "First Line", leftX: 50, topY: 100, width: 100, fontSize: 12 },
        { str: "Second Line", leftX: 50, topY: 120, width: 100, fontSize: 12 },
      ];
      const lines = groupItemsIntoLines(items);
      assert.strictEqual(lines.length, 2);
      assert.strictEqual(lines[0].text, "First Line");
      assert.strictEqual(lines[1].text, "Second Line");
    });

    await t.test("reconstructs Hindi words split across items without injecting false spaces", () => {
      // Devanagari dependent vowel signs (matras) and consonants
      const items = [
        { str: "\u0915", leftX: 50, topY: 100, width: 10, fontSize: 12 }, // क
        { str: "\u093F", leftX: 62, topY: 100, width: 8, fontSize: 12 },  // ि
        { str: "\u0924", leftX: 72, topY: 100, width: 10, fontSize: 12 }, // त
        { str: "\u093E", leftX: 84, topY: 100, width: 8, fontSize: 12 },  // ा
        { str: "\u092C", leftX: 94, topY: 100, width: 10, fontSize: 12 }, // ब
      ];
      const lines = groupItemsIntoLines(items);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].text, "\u0915\u093F\u0924\u093E\u092C"); // किताब
    });

    await t.test("handles Devanagari conjuncts with virama without space injection", () => {
      // फ् + लिप्प = फ्लिप्प
      const items = [
        { str: "\u092B\u094D", leftX: 50, topY: 100, width: 15, fontSize: 12 }, // फ्
        { str: "\u0932\u093F\u092A\u094D\u092A", leftX: 67, topY: 100, width: 35, fontSize: 12 }, // लिप्प
      ];
      const lines = groupItemsIntoLines(items);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].text, "\u092B\u094D\u0932\u093F\u092A\u094D\u092A"); // फ्लिप्प
    });

    await t.test("inserts spaces between distinct Hindi words when genuine word gap exists", () => {
      // नमस्ते + दुनिया (with gap = 12 > 3.8)
      const items = [
        { str: "\u0928\u092E\u0938\u094D\u0924\u0947", leftX: 50, topY: 100, width: 45, fontSize: 12 }, // नमस्ते
        { str: "\u0926\u0941\u0928\u093F\u092F\u093E", leftX: 107, topY: 100, width: 45, fontSize: 12 }, // दुनिया (gap = 12)
      ];
      const lines = groupItemsIntoLines(items);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].text, "\u0928\u092E\u0938\u094D\u0924\u0947 \u0926\u0941\u0928\u093F\u092F\u093E");
    });

    await t.test("preserves correct spacing around opening and closing punctuation", () => {
      const items = [
        { str: "(", leftX: 50, topY: 100, width: 6, fontSize: 12 },
        { str: "example", leftX: 58, topY: 100, width: 45, fontSize: 12 },
        { str: ")", leftX: 105, topY: 100, width: 6, fontSize: 12 },
        { str: ",", leftX: 113, topY: 100, width: 4, fontSize: 12 },
        { str: "next", leftX: 125, topY: 100, width: 30, fontSize: 12 }, // gap = 125 - 117 = 8 -> space
      ];
      const lines = groupItemsIntoLines(items);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].text, "(example), next");
    });
  });

  await mainSuite.test("groupLinesIntoParagraphs detection of headings and paragraph breaks", async (t) => {
    await t.test("does not break a paragraph when an inline word is bolded", () => {
      const lines = [
        { topY: 50, bottomY: 62, fontSize: 11, isBold: false, text: "This is a sentence with an", leftX: 54 },
        { topY: 64, bottomY: 76, fontSize: 11, isBold: true, text: "inline bold word phrase", leftX: 54 },
        { topY: 78, bottomY: 90, fontSize: 11, isBold: false, text: "continuing in the same paragraph.", leftX: 54 },
      ];
      const paras = groupLinesIntoParagraphs(lines, 595);
      assert.strictEqual(paras.length, 1);
      assert.strictEqual(paras[0].text, "This is a sentence with an inline bold word phrase continuing in the same paragraph.");
      assert.strictEqual(paras[0].isHeading, false);
    });
    await t.test("detects headings and separates paragraphs by spacing gaps", () => {
      const lines = [
        { topY: 50, bottomY: 68, fontSize: 18, isBold: true, text: "Chapter 1: Getting Started", leftX: 54 },
        { topY: 90, bottomY: 102, fontSize: 11, isBold: false, text: "This is the first sentence.", leftX: 54 },
        { topY: 106, bottomY: 118, fontSize: 11, isBold: false, text: "This continues the paragraph.", leftX: 54 },
        // Large gap indicates new paragraph
        { topY: 150, bottomY: 162, fontSize: 11, isBold: false, text: "This is the second paragraph.", leftX: 54 },
      ];

      const paras = groupLinesIntoParagraphs(lines, 595);
      assert.strictEqual(paras.length, 3);
      assert.strictEqual(paras[0].isHeading, true);
      assert.strictEqual(paras[0].text, "Chapter 1: Getting Started");
      assert.strictEqual(paras[1].isHeading, false);
      assert.strictEqual(paras[1].text, "This is the first sentence. This continues the paragraph.");
      assert.strictEqual(paras[2].text, "This is the second paragraph.");
    });

    await t.test("detects bullet list items as separate blocks", () => {
      const lines = [
        { topY: 50, bottomY: 62, fontSize: 11, isBold: false, text: "Intro line before list:", leftX: 54 },
        { topY: 68, bottomY: 80, fontSize: 11, isBold: false, text: "• First item in list", leftX: 54 },
        { topY: 84, bottomY: 96, fontSize: 11, isBold: false, text: "• Second item in list", leftX: 54 },
      ];
      const paras = groupLinesIntoParagraphs(lines, 595);
      assert.strictEqual(paras.length, 3);
      assert.strictEqual(paras[1].isList, true);
      assert.strictEqual(paras[2].isList, true);
    });
  });

  await mainSuite.test("extractSinglePage and extractDocumentText multi-page handling", async (t) => {
    await t.test("extractSinglePage extracts lines, paragraphs, and formats page text", async () => {
      const mockPage = {
        rotate: 0,
        getViewport: () => ({ width: 595, height: 842 }),
        getTextContent: async () => ({
          items: [
            { str: "Title", transform: [16, 0, 0, 16, 50, 780], width: 50, height: 16, fontName: "Bold" },
            { str: "Body paragraph.", transform: [12, 0, 0, 12, 50, 740], width: 100, height: 12, fontName: "Regular" },
          ],
        }),
        cleanup: () => {},
      };

      const result = await extractSinglePage(mockPage, 1);
      assert.strictEqual(result.pageNum, 1);
      assert.ok(result.text.includes("Title"));
      assert.strictEqual(result.paragraphs[0].isHeading, true);
      assert.ok(result.text.includes("Body paragraph."));
      assert.strictEqual(result.paragraphs.length, 2);
    });

    await t.test("extractDocumentText processes multi-page document and preserves page separators", async () => {
      const mockPdfDoc = {
        numPages: 2,
        getPage: async (i) => ({
          rotate: 0,
          getViewport: () => ({ width: 595, height: 842 }),
          getTextContent: async () => ({
            items: [
              { str: `Page ${i} content`, transform: [12, 0, 0, 12, 50, 750], width: 80, height: 12 },
            ],
          }),
          cleanup: () => {},
        }),
      };

      let progressCount = 0;
      const docResult = await extractDocumentText(mockPdfDoc, () => {
        progressCount++;
      });

      assert.strictEqual(docResult.numPages, 2);
      assert.strictEqual(docResult.pages.length, 2);
      assert.strictEqual(progressCount, 2);
      assert.ok(docResult.fullText.includes("--- Page 1 ---"));
      assert.ok(docResult.fullText.includes("Page 1 content"));
      assert.ok(docResult.fullText.includes("--- Page 2 ---"));
      assert.ok(docResult.fullText.includes("Page 2 content"));
      assert.strictEqual(docResult.isEmpty, false);
    });

    await t.test("extractDocumentText handles empty-text PDF gracefully", async () => {
      const mockPdfDoc = {
        numPages: 1,
        getPage: async () => ({
          rotate: 0,
          getViewport: () => ({ width: 595, height: 842 }),
          getTextContent: async () => ({ items: [] }),
          cleanup: () => {},
        }),
      };

      const docResult = await extractDocumentText(mockPdfDoc);
      assert.strictEqual(docResult.isEmpty, true);
      assert.ok(docResult.fullText.includes("[Empty Page]"));
    });

    await t.test("extractDocumentText handles malformed page extraction gracefully", async () => {
      const mockPdfDoc = {
        numPages: 2,
        getPage: async (i) => {
          if (i === 1) throw new Error("Corrupted stream on page 1");
          return {
            rotate: 0,
            getViewport: () => ({ width: 595, height: 842 }),
            getTextContent: async () => ({
              items: [{ str: "Page 2 recovered", transform: [12, 0, 0, 12, 50, 750], width: 80, height: 12 }],
            }),
            cleanup: () => {},
          };
        },
      };

      const docResult = await extractDocumentText(mockPdfDoc);
      assert.strictEqual(docResult.pages.length, 2);
      assert.strictEqual(docResult.pages[0].text, "");
      assert.ok(docResult.pages[1].text.includes("Page 2 recovered"));
    });
  });

  await mainSuite.test("sanitizeForPdfFont sanitizes unsupported unicode characters", async (t) => {
    await t.test("strips control characters and emojis while preserving English text", () => {
      const input = "Hello \u0000World! \tTab \r\nNewline 👍 Emoji";
      const output = sanitizeForPdfFont(input);
      assert.ok(!output.includes("\u0000"));
      assert.ok(!output.includes("👍"));
      assert.ok(output.includes("Hello"));
      assert.ok(output.includes("World!"));
    });

    await t.test("preserves Hindi, Unicode punctuation, mathematical symbols, and currency symbols", () => {
      const input = "Hindi: \u0928\u092E\u0938\u094D\u0924\u0947 | Symbols: \u20B91,500 \u00B1 5% \u2264 100 \u20AC | Quotes: \u201CHello\u201D \u2018World\u2019 \u2014 \u2026";
      const output = sanitizeForPdfFont(input);
      assert.ok(output.includes("\u0928\u092E\u0938\u094D\u0924\u0947")); // नमस्ते
      assert.ok(output.includes("\u20B91,500")); // ₹1,500
      assert.ok(output.includes("\u00B1")); // ±
      assert.ok(output.includes("\u2264")); // ≤
      assert.ok(output.includes("\u20AC")); // €
      assert.ok(output.includes("\u201CHello\u201D")); // “Hello”
      assert.ok(output.includes("\u2014")); // —
      assert.ok(output.includes("\u2026")); // …
    });

    await t.test("maps typography and symbols to WinAnsi equivalents when strictWinAnsi is enabled", () => {
      const input = "\u201CHello\u201D \u2018World\u2019 \u2014 test\u2026 \u20B9500 \u20AC100";
      const output = sanitizeForPdfFont(input, { strictWinAnsi: true });
      assert.ok(output.includes('"Hello"'));
      assert.ok(output.includes("'World'"));
      assert.ok(output.includes("- test..."));
      assert.ok(output.includes("INR500"));
      assert.ok(output.includes("EUR100"));
    });
  });

  await mainSuite.test("generatePdfFromText generates valid new PDF with overflow page breaks", async (t) => {
    // Mock pdf-lib for testing environment
    const mockPages = [];
    const mockFonts = {
      widthOfTextAtSize: (str, size) => str.length * size * 0.5,
    };

    const mockPdfDoc = {
      embedFont: async () => mockFonts,
      addPage: (dims) => {
        const page = {
          dims,
          drawCalls: [],
          drawText: (text, opts) => {
            page.drawCalls.push({ text, opts });
          },
        };
        mockPages.push(page);
        return page;
      },
      getPages: () => mockPages,
      save: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31]), // %PDF1
    };

    const mockPdfLib = {
      PDFDocument: {
        create: async () => mockPdfDoc,
      },
      StandardFonts: {
        Helvetica: "Helvetica",
        HelveticaBold: "Helvetica-Bold",
        HelveticaOblique: "Helvetica-Oblique",
      },
      rgb: (r, g, b) => ({ r, g, b }),
    };

    await t.test("generates pages from structured text and embeds page numbers", async () => {
      mockPages.length = 0;
      const text = `--- Page 1 ---\n\n# Document Header\n\nThis is paragraph one.\n\n--- Page 2 ---\n\nParagraph on page two.`;
      const result = await generatePdfFromText(text, { pdfLib: mockPdfLib });

      assert.ok(result);
      assert.strictEqual(mockPages.length, 2);

      // Verify drawText was called with header and paragraph
      const p1Texts = mockPages[0].drawCalls.map((c) => c.text);
      assert.ok(p1Texts.includes("Document Header"));
      assert.ok(p1Texts.includes("This is paragraph one."));

      // Verify footer page numbers were drawn
      assert.ok(p1Texts.includes("Page 1 of 2"));
      const p2Texts = mockPages[1].drawCalls.map((c) => c.text);
      assert.ok(p2Texts.includes("Page 2 of 2"));
    });

    await t.test("automatically breaks page on text overflow", async () => {
      mockPages.length = 0;
      // Generate text with many lines to force overflow beyond single page
      const longPara = Array.from({ length: 70 }, (_, i) => `Line number ${i + 1} with repeated text to fill up the height.`).join(" ");
      const text = `# Overflow Test\n\n${longPara}`;

      await generatePdfFromText(text, { pdfLib: mockPdfLib, pageHeight: 400, marginBottom: 50, marginTop: 50 });

      assert.ok(mockPages.length > 1, `Expected multiple pages on overflow, got ${mockPages.length}`);
    });

    await t.test("embeds Unicode TrueType font via fontkit when available and preserves Hindi text", async () => {
      const fontPath = path.join(__dirname, "../assets/fonts/Poppins-Regular.ttf");
      const fontBytes = fs.readFileSync(fontPath);

      let registeredFontkit = null;
      let embeddedFontOptions = null;

      const mockUnicodePdfDoc = {
        registerFontkit: (fk) => {
          registeredFontkit = fk;
        },
        embedFont: async (bytes, opts) => {
          embeddedFontOptions = opts;
          return {
            widthOfTextAtSize: (str, size) => str.length * size * 0.5,
          };
        },
        addPage: (dims) => {
          const page = {
            dims,
            drawCalls: [],
            drawText: (text, opts) => {
              page.drawCalls.push({ text, opts });
            },
          };
          mockPages.push(page);
          return page;
        },
        getPages: () => mockPages,
        save: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x55]),
      };

      const mockUnicodePdfLib = {
        PDFDocument: {
          create: async () => mockUnicodePdfDoc,
        },
        StandardFonts: mockPdfLib.StandardFonts,
        rgb: mockPdfLib.rgb,
      };

      const mockFk = { id: "fontkit-mock" };
      mockPages.length = 0;

      const text = `--- Page 1 ---\n\n\u0928\u092E\u0938\u094D\u0924\u0947 \u092D\u093E\u0930\u0924 \u20B9500 \u201CQuotes\u201D`;
      const result = await generatePdfFromText(text, {
        pdfLib: mockUnicodePdfLib,
        fontkit: mockFk,
        fontBytes,
      });

      assert.ok(result);
      assert.strictEqual(registeredFontkit, mockFk);
      assert.deepStrictEqual(embeddedFontOptions, { subset: true });

      const pageTexts = mockPages[0].drawCalls.map((c) => c.text);
      assert.ok(pageTexts.some((t) => t.includes("\u0928\u092E\u0938\u094D\u0924\u0947")));
      assert.ok(pageTexts.some((t) => t.includes("\u20B9500")));
      assert.ok(pageTexts.some((t) => t.includes("\u201CQuotes\u201D")));
    });
  });
});
