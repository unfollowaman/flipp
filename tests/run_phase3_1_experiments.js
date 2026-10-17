const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createServer, executeInBrowserBenchmark } = require('./run_phase2_benchmark_utils.js');
const { calculateCER, calculateWER, extractMatchingSubsegment } = require('./accuracy_metrics.js');
const { REFERENCE_PASSAGES } = require('./reference_passages.js');

async function runPhase31Experiments() {
  console.log('\n--- Running Phase 3.1 Controlled Experiments ---');

  const server = await createServer(8080);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/tools/pdf-to-text/', { waitUntil: 'networkidle' });

  const experiments = [
    {
      id: 'control_phase3',
      name: 'Control (Phase 3 Baseline: hin, 1.5x, grayscale_contrast, PSM 4)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'grayscale_contrast',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
    {
      id: 'exp1_scale20',
      name: 'Exp 1: Scale 2.0x (hin, 2.0x, grayscale_contrast, PSM 4)',
      lang: 'hin',
      scale: 2.0,
      preprocessing: 'grayscale_contrast',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
    {
      id: 'exp2_contrast_mild',
      name: 'Exp 2: Mild Contrast Preprocessing (hin, 1.5x, contrast, PSM 4)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'contrast',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
    {
      id: 'exp3_psm6',
      name: 'Exp 3: PSM 6 Uniform Block (hin, 1.5x, grayscale_contrast, PSM 6)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'grayscale_contrast',
      tesseractParams: { tessedit_pageseg_mode: '6' },
    },
    {
      id: 'exp4_hin_eng_psm4',
      name: 'Exp 4: hin+eng Language Mode (hin+eng, 1.5x, grayscale_contrast, PSM 4)',
      lang: 'hin+eng',
      scale: 1.5,
      preprocessing: 'grayscale_contrast',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
  ];

  const summary = [];

  for (const exp of experiments) {
    console.log(`\nTesting ${exp.name}...`);
    const res = await executeInBrowserBenchmark(page, exp);

    // Reconstruct full text from page results
    const fullText = res.pageResults.map((p) => p.rawText || '').join('\n\n');

    let totalRefChars = 0;
    let totalErrChars = 0;
    let totalRefWords = 0;
    let totalErrWords = 0;

    for (const passage of REFERENCE_PASSAGES) {
      const seg = extractMatchingSubsegment(
        passage.text,
        fullText,
        passage.startKeyword,
        passage.endKeyword
      );
      const cerRes = calculateCER(passage.text, seg);
      const werRes = calculateWER(passage.text, seg);

      totalRefChars += cerRes.refLength;
      totalErrChars += cerRes.distance;
      totalRefWords += werRes.refWordsCount;
      totalErrWords += werRes.distance;
    }

    const overallCER = totalRefChars > 0 ? totalErrChars / totalRefChars : 0;
    const overallWER = totalRefWords > 0 ? totalErrWords / totalRefWords : 0;

    // Count specific word patterns
    const dhalCount = (fullText.match(/\bढल\b|\bढलों\b/g) || []).length;
    const dalCount = (fullText.match(/\bदल\b|\bदलों\b/g) || []).length;
    const gerCount = (fullText.match(/\bger\b/gi) || []).length;
    const num1885Count = (fullText.match(/\b1885\b/g) || []).length;
    const civicsCount = (fullText.match(/Civics/gi) || []).length;

    const expMetrics = {
      id: exp.id,
      name: exp.name,
      totalTimeMs: res.totalTimeMs,
      avgOcrTimePerPageMs: res.avgOcrTimePerPageMs,
      overallCER,
      overallWER,
      totalErrChars,
      totalRefChars,
      totalErrWords,
      totalRefWords,
      dhalCount,
      dalCount,
      gerCount,
      num1885Count,
      civicsCount,
    };

    console.log(`Results for ${exp.id}:`);
    console.log(`  CER: ${(overallCER * 100).toFixed(2)}% | WER: ${(overallWER * 100).toFixed(2)}%`);
    console.log(`  Total Time: ${(res.totalTimeMs / 1000).toFixed(2)}s | Avg OCR: ${res.avgOcrTimePerPageMs.toFixed(0)}ms/page`);
    console.log(`  'दल' count: ${dalCount} | 'ढल' count: ${dhalCount} | 'ger' count: ${gerCount} | '1885' count: ${num1885Count}`);

    summary.push(expMetrics);
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'phase3_1_experiment_results.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log('\nSaved phase3_1_experiment_results.json');

  await browser.close();
  server.close();

  return summary;
}

if (require.main === module) {
  runPhase31Experiments().catch((err) => {
    console.error('Phase 3.1 Experiments Failed:', err);
    process.exit(1);
  });
}

module.exports = { runPhase31Experiments };
