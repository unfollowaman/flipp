const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createServer, executeInBrowserBenchmark } = require('./run_phase2_benchmark_utils.js');

async function runSingleScale(scaleStr) {
  const scale = parseFloat(scaleStr);
  console.log(`\n--- Running Experiment 3: Rendering Scale ${scale}x ---`);

  const server = await createServer(8080);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/tools/pdf-to-text/', { waitUntil: 'networkidle' });

  const config = {
    expName: `Exp 3: Scale ${scale}x`,
    lang: 'hin+eng',
    scale: scale,
  };

  const res = await executeInBrowserBenchmark(page, config);
  console.log(`Scale ${scale}x complete in ${res.totalTimeMs.toFixed(0)} ms. Avg OCR: ${res.avgOcrTimePerPageMs.toFixed(0)} ms/page. Avg Render: ${res.avgRenderTimePerPageMs.toFixed(0)} ms/page.`);

  fs.writeFileSync(
    path.join(__dirname, `exp3_scale_${scale}x_results.json`),
    JSON.stringify(res, null, 2)
  );
  console.log(`Saved exp3_scale_${scale}x_results.json`);

  await browser.close();
  server.close();
}

if (require.main === module) {
  const scaleArg = process.argv[2] || '1.0';
  runSingleScale(scaleArg);
}

module.exports = { runSingleScale };
