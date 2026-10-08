const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createServer, executeInBrowserBenchmark } = require('./run_phase2_benchmark_utils.js');

async function runSinglePrep(prepType) {
  console.log(`\n--- Running Experiment 4: Preprocessing (${prepType}) @ 2.0x ---`);

  const server = await createServer(8080);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/tools/pdf-to-text/', { waitUntil: 'networkidle' });

  const config = {
    expName: `Exp 4: Preprocessing ${prepType}`,
    lang: 'hin+eng',
    scale: 2.0,
    preprocessing: prepType,
  };

  const res = await executeInBrowserBenchmark(page, config);
  console.log(`Prep ${prepType} complete in ${res.totalTimeMs.toFixed(0)} ms. Avg OCR: ${res.avgOcrTimePerPageMs.toFixed(0)} ms/page.`);

  fs.writeFileSync(
    path.join(__dirname, `exp4_prep_${prepType}_results.json`),
    JSON.stringify(res, null, 2)
  );
  console.log(`Saved exp4_prep_${prepType}_results.json`);

  await browser.close();
  server.close();
}

if (require.main === module) {
  const prepArg = process.argv[2] || 'grayscale';
  runSinglePrep(prepArg);
}

module.exports = { runSinglePrep };
