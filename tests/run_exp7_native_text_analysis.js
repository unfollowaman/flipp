const fs = require('fs');
const path = require('path');

// Run analysis on native text items
async function analyzeNativePdfText() {
  // Use playwright browser context to run pdf.js on assets/test.pdf for complete font and CMap inspection
  const { chromium } = require('playwright');
  const { createServer } = require('./run_phase2_benchmark_utils.js');

  const server = await createServer(8080);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/tools/pdf-to-text/', { waitUntil: 'networkidle' });

  const nativeAnalysis = await page.evaluate(async () => {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    const pdfResp = await fetch('/assets/test.pdf');
    const arrayBuffer = await pdfResp.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer, useSystemFonts: true }).promise;

    const pagesData = [];

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const pageObj = await pdfDoc.getPage(p);
      const textContent = await pageObj.getTextContent();

      const items = textContent.items;
      const rawTextJoined = items.map((i) => i.str).join(' ');

      // Count null bytes
      const nullMatches = rawTextJoined.match(/\u0000/g) || [];

      // Count detached matras
      const detachedMatras = rawTextJoined.match(/(?:^|\s)[\u093e-\u094c\u0901-\u0903]/g) || [];

      // Count fragmented tokens
      const tokens = rawTextJoined.split(/\s+/);
      const devanagariTokens = tokens.filter((t) => /[\u0900-\u097F]/.test(t));
      const shortDevTokens = devanagariTokens.filter(
        (t) => t.replace(/[^\u0900-\u097F]/g, '').length <= 2
      );

      // Collect sample items where null bytes occur
      const nullItems = items.filter((i) => i.str.includes('\u0000'));

      pagesData.push({
        pageNumber: p,
        totalItems: items.length,
        totalChars: rawTextJoined.length,
        nullByteCount: nullMatches.length,
        nullItemCount: nullItems.length,
        nullItemSamples: nullItems.slice(0, 5).map((i) => ({
          str: i.str,
          fontName: i.fontName,
          hasTransform: !!i.transform,
        })),
        detachedMatraCount: detachedMatras.length,
        totalDevanagariTokens: devanagariTokens.length,
        shortDevanagariTokens: shortDevTokens.length,
        fragmentationRatio:
          devanagariTokens.length > 0 ? shortDevTokens.length / devanagariTokens.length : 0,
        sampleRawText: rawTextJoined.slice(0, 200),
      });
    }

    await pdfDoc.destroy();
    return pagesData;
  });

  await browser.close();
  server.close();

  fs.writeFileSync(
    path.join(__dirname, 'exp7_native_text_analysis.json'),
    JSON.stringify(nativeAnalysis, null, 2)
  );
  console.log('Saved exp7_native_text_analysis.json');
}

if (require.main === module) {
  analyzeNativePdfText();
}

module.exports = { analyzeNativePdfText };
