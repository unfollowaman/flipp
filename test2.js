const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function run() {
  const bytes = fs.readFileSync('normal.pdf');
  const srcPdf = await PDFDocument.load(bytes);
  const outPdf = await PDFDocument.create();
  try {
    const pages = await outPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    console.log("Success:", pages.length);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
