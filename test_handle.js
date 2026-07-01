const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
global.window = { PDFLib: { PDFDocument } };

async function showToast(msg, type) {
  console.log(`Toast: [${type}] ${msg}`);
}
global.showToast = showToast;
global.document = { getElementById: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} }, focus: ()=>{} }), createElement: ()=>({}), body: { appendChild: ()=>{}, removeChild: ()=>{} } };

async function run() {
  const bytes = fs.readFileSync('normal.pdf');
  try {
    const tempDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (!tempDoc.isEncrypted) {
      console.log('Unprotected handled correctly');
    }
  } catch(e) {
    console.log(e);
  }
}
run();
