const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createServer, executeInBrowserBenchmark } = require('./run_phase2_benchmark_utils.js');

async function runSinglePsm(psmVal) {
  const psm = parseInt(psmVal, 10);
  console.log(`\n--- Running Experiment 5: PSM Mode ${psm} @ 2.0x ---`);

  const server = await createServer(8080);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/tools/pdf-to-text/', { waitUntil: 'networkidle' });

  const config = {
    expName: `Exp 5: PSM ${psm}`,
    lang: 'hin+eng',
    scale: 2.0,
    tesseractParams: {
      tessedit_pageseg_mode: String(psm),
    },
  };

  const res = await executeInBrowserBenchmark(page, config);
  console.log(`PSM ${psm} complete in ${res.totalTimeMs.toFixed(0)} ms. Avg OCR: ${res.avgOcrTimePerPageMs.toFixed(0)} ms/page.`);

  fs.writeFileSync(
    path.join(__dirname, `exp5_psm_${psm}_results.json`),
    JSON.stringify(res, null, 2)
  );
  console.log(`Saved exp5_psm_${psm}_results.json`);

  await browser.close();
  server.close();
}

if (require.main === module) {
  const psmArg = process.argv[2] || '3';
  runSinglePsm(psmArg);
}

module.exports = { runSinglePsm };
