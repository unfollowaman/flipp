const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createServer, executeInBrowserBenchmark } = require('./run_phase2_benchmark_utils.js');

async function runExp2HindiOnly(page) {
  console.log('\n--- Running Experiment 2: Tesseract hin Only (2.0x scale) ---');
  const config = {
    expName: 'Exp 2: hin Only (2.0x)',
    lang: 'hin',
    scale: 2.0,
  };
  const res = await executeInBrowserBenchmark(page, config);
  console.log(`Exp 2 Complete in ${res.totalTimeMs.toFixed(0)} ms.`);
  console.log(`Worker Init: ${res.workerInitTimeMs.toFixed(0)} ms`);
  console.log(`Avg OCR Time/Page: ${res.avgOcrTimePerPageMs.toFixed(0)} ms`);

  let totalGer = 0, totalDhal = 0, totalDhuniya = 0, totalPramural = 0, total885 = 0, total1885 = 0, totalOf = 0, totalBl = 0;
  res.pageResults.forEach((p) => {
    totalGer += p.corruptionPatterns.gerCount;
    totalDhal += p.corruptionPatterns.dhalCount;
    totalDhuniya += p.corruptionPatterns.dhuniyaCount;
    totalPramural += p.corruptionPatterns.pramuralCount;
    total885 += p.corruptionPatterns.num885Count;
    total1885 += p.corruptionPatterns.num1885Count;
    totalOf += p.corruptionPatterns.ofCount;
    totalBl += p.corruptionPatterns.blCount;
  });
  console.log(`Corruption Totals: ger=${totalGer}, ढल=${totalDhal}, ढुनिया=${totalDhuniya}, प्रमुरल=${totalPramural}, 885=${total885}, 1885=${total1885}, of=${totalOf}, Bl=${totalBl}`);

  return res;
}

if (require.main === module) {
  (async () => {
    const server = await createServer(8080);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://localhost:8080/tools/pdf-to-text/', { waitUntil: 'networkidle' });

    const exp2Results = await runExp2HindiOnly(page);
    fs.writeFileSync(
      path.join(__dirname, 'exp2_hin_only_results.json'),
      JSON.stringify(exp2Results, null, 2)
    );
    console.log('Saved exp2_hin_only_results.json');

    await browser.close();
    server.close();
  })();
}

module.exports = { runExp2HindiOnly };
