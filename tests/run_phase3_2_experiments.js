const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createServer } = require('./run_phase2_benchmark_utils.js');
const { calculateCER, calculateWER, extractMatchingSubsegment } = require('./accuracy_metrics.js');
const { REFERENCE_PASSAGES } = require('./reference_passages.js');

async function executeInBrowserExperiment(page, cfg) {
  return await page.evaluate(async (cfg) => {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    const pdfUrl = '/assets/test.pdf';

    const pdfResp = await fetch(pdfUrl);
    const arrayBuffer = await pdfResp.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer, useSystemFonts: true }).promise;

    const workerStart = performance.now();
    const worker = await window.Tesseract.createWorker(cfg.lang, cfg.oem ?? 1);
    if (cfg.tesseractParams) {
      await worker.setParameters(cfg.tesseractParams);
    }
    const workerInitTimeMs = performance.now() - workerStart;

    const results = [];
    const overallStart = performance.now();

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const pageObj = await pdfDoc.getPage(p);
      const viewport = pageObj.getViewport({ scale: cfg.scale || 1.5 });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderStart = performance.now();
      await pageObj.render({ canvasContext: ctx, viewport }).promise;
      const renderTimeMs = performance.now() - renderStart;

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      if (cfg.preprocessing === 'grayscale_contrast') {
        // Control: linear piecewise contrast
        for (let i = 0; i < data.length; i += 4) {
          const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          let c = avg < 180 ? Math.max(0, avg - 30) : Math.min(255, avg + 20);
          data[i] = c;
          data[i + 1] = c;
          data[i + 2] = c;
        }
      } else if (cfg.preprocessing === 'otsu') {
        // Otsu Global Adaptive Binarization
        const histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
          const avg = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          histogram[avg]++;
        }
        const total = data.length / 4;
        let sum = 0;
        for (let t = 0; t < 256; t++) sum += t * histogram[t];
        let sumB = 0;
        let wB = 0;
        let wF = 0;
        let maxVar = 0;
        let threshold = 128;
        for (let t = 0; t < 256; t++) {
          wB += histogram[t];
          if (wB === 0) continue;
          wF = total - wB;
          if (wF === 0) break;
          sumB += t * histogram[t];
          const mB = sumB / wB;
          const mF = (sum - sumB) / wF;
          const varBetween = wB * wF * (mB - mF) * (mB - mF);
          if (varBetween > maxVar) {
            maxVar = varBetween;
            threshold = t;
          }
        }
        for (let i = 0; i < data.length; i += 4) {
          const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const val = avg < threshold ? 0 : 255;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }
      } else if (cfg.preprocessing === 'sigmoid_contrast') {
        // Sigmoid S-curve contrast stretching
        for (let i = 0; i < data.length; i += 4) {
          const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const x = (avg - 128) / 32;
          const sig = 1 / (1 + Math.exp(-x));
          const c = Math.round(sig * 255);
          data[i] = c;
          data[i + 1] = c;
          data[i + 2] = c;
        }
      } else if (cfg.preprocessing === 'sharpen_contrast') {
        // Unsharp mask (sharpening kernel) followed by contrast enhancement
        const src = new Uint8ClampedArray(data.length / 4);
        for (let i = 0; i < data.length; i += 4) {
          src[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const w = canvas.width;
        const h = canvas.height;
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            let val = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                val += src[(y + ky) * w + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
              }
            }
            val = Math.min(255, Math.max(0, val));
            const c = val < 180 ? Math.max(0, val - 30) : Math.min(255, val + 20);
            const idx = (y * w + x) * 4;
            data[idx] = c;
            data[idx + 1] = c;
            data[idx + 2] = c;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      const ocrStart = performance.now();
      const { data: ocrData } = await worker.recognize(canvas);
      const ocrTimeMs = performance.now() - ocrStart;

      canvas.width = 0;
      canvas.height = 0;
      if (typeof pageObj.cleanup === 'function') pageObj.cleanup();

      const rawText = ocrData.text ? ocrData.text.normalize('NFC') : '';
      results.push({
        pageNumber: p,
        renderTimeMs,
        ocrTimeMs,
        rawText,
      });
    }

    const totalTimeMs = performance.now() - overallStart;
    await worker.terminate();
    if (typeof pdfDoc.destroy === 'function') await pdfDoc.destroy();

    return {
      config: cfg,
      workerInitTimeMs,
      totalTimeMs,
      pageResults: results,
    };
  }, cfg);
}

function evaluateAccuracyOnPassages(fullText) {
  let totalRefChars = 0;
  let totalErrChars = 0;
  let totalRefWords = 0;
  let totalErrWords = 0;
  const passageBreakdown = [];

  for (const passage of REFERENCE_PASSAGES) {
    const extractedSegment = extractMatchingSubsegment(
      passage.text,
      fullText,
      passage.pageNumber,
      passage.startKeyword,
      passage.endKeyword
    );

    const cerRes = calculateCER(passage.text, extractedSegment);
    const werRes = calculateWER(passage.text, extractedSegment);

    passageBreakdown.push({
      id: passage.id,
      pageNumber: passage.pageNumber,
      cer: cerRes.cer,
      wer: werRes.wer,
      refLength: cerRes.refLength,
      distanceChars: cerRes.distance,
      refWords: werRes.refWordsCount,
      distanceWords: werRes.distance,
      snippet: extractedSegment.substring(0, 80) + '...',
    });

    totalRefChars += cerRes.refLength;
    totalErrChars += cerRes.distance;
    totalRefWords += werRes.refWordsCount;
    totalErrWords += werRes.distance;
  }

  const overallCER = totalRefChars > 0 ? totalErrChars / totalRefChars : 0;
  const overallWER = totalRefWords > 0 ? totalErrWords / totalRefWords : 0;

  return {
    overallCER,
    overallWER,
    totalRefChars,
    totalErrChars,
    totalRefWords,
    totalErrWords,
    passageBreakdown,
  };
}

async function runPhase32Experiments() {
  console.log('\n--- Phase 3.2 Controlled OCR Accuracy Experiments ---');

  const allExperiments = [
    {
      id: 'Control',
      description: 'Control (Phase 3 Baseline: hin, 1.5x, grayscale_contrast, PSM 4)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'grayscale_contrast',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
    {
      id: 'Exp_1_Otsu',
      description: 'Exp 1: Otsu Adaptive Binarization (hin, 1.5x, otsu, PSM 4)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'otsu',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
    {
      id: 'Exp_2_SigmoidContrast',
      description: 'Exp 2: Sigmoid S-Curve Contrast (hin, 1.5x, sigmoid_contrast, PSM 4)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'sigmoid_contrast',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
    {
      id: 'Exp_3_SharpenContrast',
      description: 'Exp 3: Unsharp Mask Sharpening + Contrast (hin, 1.5x, sharpen_contrast, PSM 4)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'sharpen_contrast',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
    {
      id: 'Exp_4_DPI300',
      description: 'Exp 4: Explicit DPI 300 Parameter (hin, 1.5x, grayscale_contrast, PSM 4, user_defined_dpi=300)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'grayscale_contrast',
      tesseractParams: { tessedit_pageseg_mode: '4', user_defined_dpi: '300' },
    },
    {
      id: 'Exp_5_PSM3',
      description: 'Exp 5: Fully Automatic PSM 3 (hin, 1.5x, grayscale_contrast, PSM 3)',
      lang: 'hin',
      scale: 1.5,
      preprocessing: 'grayscale_contrast',
      tesseractParams: { tessedit_pageseg_mode: '3' },
    },
    {
      id: 'Exp_6_Scale1_75',
      description: 'Exp 6: Rendering Scale 1.75x (hin, 1.75x, grayscale_contrast, PSM 4)',
      lang: 'hin',
      scale: 1.75,
      preprocessing: 'grayscale_contrast',
      tesseractParams: { tessedit_pageseg_mode: '4' },
    },
  ];

  const targetIds = process.argv.slice(2);
  const experimentsToRun = targetIds.length > 0
    ? allExperiments.filter((exp) => targetIds.includes(exp.id))
    : allExperiments;

  const outputPath = path.resolve(__dirname, 'phase3_2_experiment_results.json');
  let summaryResults = [];
  if (fs.existsSync(outputPath)) {
    try {
      summaryResults = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    } catch (e) {
      summaryResults = [];
    }
  }

  const server = await createServer(8080);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/tools/pdf-to-text/', { waitUntil: 'networkidle' });

  for (const expConfig of experimentsToRun) {
    console.log(`\nRunning ${expConfig.description}...`);
    const res = await executeInBrowserExperiment(page, expConfig);
    const fullText = res.pageResults.map((p) => p.rawText).join('\n\n').trim();

    const accuracy = evaluateAccuracyOnPassages(fullText);

    const errors = {
      dhalCount: (fullText.match(/\bढल\b|\bढलों\b/g) || []).length,
      num1885Count: (fullText.match(/\b1885\b/g) || []).length,
      num885Count: (fullText.match(/\b885\b/g) || []).length,
      politicalPartiesCount: (fullText.match(/Political\s+Parties/gi) || []).length,
      gerCount: (fullText.match(/\bger\b/gi) || []).length,
    };

    const expSummary = {
      id: expConfig.id,
      description: expConfig.description,
      totalTimeMs: res.totalTimeMs,
      overallCER: accuracy.overallCER,
      overallWER: accuracy.overallWER,
      totalRefChars: accuracy.totalRefChars,
      totalErrChars: accuracy.totalErrChars,
      totalRefWords: accuracy.totalRefWords,
      totalErrWords: accuracy.totalErrWords,
      errors,
      passageBreakdown: accuracy.passageBreakdown,
    };

    // Replace existing entry if re-running, or append
    const existingIdx = summaryResults.findIndex((r) => r.id === expConfig.id);
    if (existingIdx !== -1) {
      summaryResults[existingIdx] = expSummary;
    } else {
      summaryResults.push(expSummary);
    }

    fs.writeFileSync(outputPath, JSON.stringify(summaryResults, null, 2));
    console.log(`Saved ${expConfig.id} summary | Time: ${(res.totalTimeMs / 1000).toFixed(2)}s | CER: ${(accuracy.overallCER * 100).toFixed(2)}% | WER: ${(accuracy.overallWER * 100).toFixed(2)}% | 1885s: ${errors.num1885Count}`);
  }

  await browser.close();
  server.close();

  return summaryResults;
}

if (require.main === module) {
  runPhase32Experiments().catch((err) => {
    console.error('Phase 3.2 Experiments Failed:', err);
    process.exit(1);
  });
}

module.exports = { runPhase32Experiments };
