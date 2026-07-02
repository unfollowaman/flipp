const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function run() {
  const bytes = fs.readFileSync('normal.pdf');
  const outPdf = await PDFDocument.create();
  try {
    const srcPdf1 = await PDFDocument.load(bytes);
    const pages1 = await outPdf.copyPages(srcPdf1, srcPdf1.getPageIndices());
    pages1.forEach(p => outPdf.addPage(p));

    const srcPdf2 = await PDFDocument.load(bytes);
    const pages2 = await outPdf.copyPages(srcPdf2, srcPdf2.getPageIndices());
    pages2.forEach(p => outPdf.addPage(p));

    const outBytes = await outPdf.save();
    console.log("Success, size:", outBytes.length);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
