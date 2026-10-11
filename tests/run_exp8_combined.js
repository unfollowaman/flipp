const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createServer, executeInBrowserBenchmark } = require('./run_phase2_benchmark_utils.js');

async function runExp8Combined() {
  console.log('\n--- Running Experiment 8: Actual Combined Candidate (hin, 1.5x, GrayscaleContrast, PSM 4) ---');

  const server = await createServer(8080);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/tools/pdf-to-text/', { waitUntil: 'networkidle' });

  const config = {
    expName: 'Exp 8: Combined Winner Candidate (hin, 1.5x, grayscale_contrast, PSM 4)',
    lang: 'hin',
    scale: 1.5,
    preprocessing: 'grayscale_contrast',
    tesseractParams: {
      tessedit_pageseg_mode: '4',
    },
  };

  const res = await executeInBrowserBenchmark(page, config);
  console.log(`Combined Candidate Complete in ${res.totalTimeMs.toFixed(0)} ms. Avg OCR: ${res.avgOcrTimePerPageMs.toFixed(0)} ms/page.`);

  fs.writeFileSync(
    path.join(__dirname, 'exp8_combined_candidate_results.json'),
    JSON.stringify(res, null, 2)
  );
  console.log('Saved exp8_combined_candidate_results.json');

  await browser.close();
  server.close();
  return res;
}

if (require.main === module) {
  runExp8Combined();
}

module.exports = { runExp8Combined };
