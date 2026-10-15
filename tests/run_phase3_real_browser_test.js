const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createServer } = require('./run_phase2_benchmark_utils.js');

async function runPhase3BrowserVerification() {
  console.log('\n--- Phase 3 Real-Browser Verification: PDF -> Text Feature ---');

  const server = await createServer(8080);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
  });
  const page = await context.newPage();

  // Log console errors/warnings if any
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    }
  });

  const pageUrl = 'http://localhost:8080/tools/pdf-to-text/';
  console.log(`Navigating to ${pageUrl}...`);
  await page.goto(pageUrl, { waitUntil: 'networkidle' });

  const testPdfPath = path.resolve(__dirname, '../assets/test.pdf');
  if (!fs.existsSync(testPdfPath)) {
    throw new Error(`Test PDF fixture not found at ${testPdfPath}`);
  }

  console.log(`Uploading ${testPdfPath}...`);
  const fileInput = await page.$('#pdf-file-input');
  if (!fileInput) {
    throw new Error('Could not find #pdf-file-input on page');
  }

  const overallStartTime = Date.now();

  // Upload file to input
  await fileInput.setInputFiles(testPdfPath);

  // Wait for results area to become visible and progress to reach extraction complete
  console.log('Waiting for PDF extraction and OCR processing to complete...');
  await page.waitForSelector('#pdf-results.is-visible', { timeout: 180000 });
  await page.waitForFunction(
    () => {
      const label = document.getElementById('pdf-progress-label');
      const progressArea = document.getElementById('pdf-progress');
      return (
        (label && label.textContent.includes('complete')) ||
        (progressArea && progressArea.style.display === 'none')
      );
    },
    null,
    { timeout: 180000 }
  );

  const totalTimeMs = Date.now() - overallStartTime;
  console.log(`Conversion finished in ${(totalTimeMs / 1000).toFixed(2)} seconds.`);

  // Verify OCR notice display
  const ocrNoticeVisible = await page.$eval('#ocr-notice', (el) => el.style.display !== 'none');
  console.log(`OCR notice displayed: ${ocrNoticeVisible}`);

  // Get displayed text in textarea
  const uiText = await page.$eval('#pdf-text-output', (el) => el.value);
  console.log(`UI extracted text length: ${uiText.length} characters.`);

  // Trigger download and capture downloaded file
  console.log('Triggering TXT file download...');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('#pdf-download-btn'),
  ]);

  const downloadedFileName = download.suggestedFilename();
  const downloadPath = path.resolve(__dirname, downloadedFileName);
  await download.saveAs(downloadPath);
  console.log(`Downloaded file saved to ${downloadPath}`);

  const downloadedContent = fs.readFileSync(downloadPath, 'utf8');
  console.log(`Downloaded TXT character count: ${downloadedContent.length}`);

  // Quality Audit checks
  const metrics = {
    totalTimeMs,
    avgTimePerPageMs: totalTimeMs / 17,
    downloadedFileName,
    uiTextMatch: uiText === downloadedContent,
    uiTextLength: uiText.length,
    downloadedLength: downloadedContent.length,
    nullCount: (downloadedContent.match(/\u0000/g) || []).length,
    replacementCount: (downloadedContent.match(/\uFFFD/g) || []).length,
    gerCount: (downloadedContent.match(/\bger\b/gi) || []).length,
    gertCount: (downloadedContent.match(/\bgert\b/gi) || []).length,
    gellCount: (downloadedContent.match(/\bgell\b/gi) || []).length,
    dhalCount: (downloadedContent.match(/\bढल\b/g) || []).length,
    dhuniyaCount: (downloadedContent.match(/\bढुनिया\b/g) || []).length,
    pramuralCount: (downloadedContent.match(/\bप्रमुरल\b/g) || []).length,
    num885Count: (downloadedContent.match(/\b885\b/g) || []).length,
    num1885Count: (downloadedContent.match(/\b1885\b/g) || []).length,
    ofCount: (downloadedContent.match(/\bof\b/gi) || []).length,
    blCount: (downloadedContent.match(/\bBl\b/g) || []).length,
    civicsCount: (downloadedContent.match(/\bCivics\b/gi) || []).length,
  };

  console.log('\n--- Downloaded TXT Content Metrics ---');
  console.log(JSON.stringify(metrics, null, 2));

  // Save detailed result file for implementation report
  const outputReportPath = path.resolve(__dirname, 'phase3_browser_verification_results.json');
  fs.writeFileSync(
    outputReportPath,
    JSON.stringify(
      {
        metrics,
        textSampleExcerptStart: downloadedContent.substring(0, 800),
        textSampleExcerptPage16: downloadedContent.split('\n\n')[15] || '',
      },
      null,
      2
    )
  );
  console.log(`Saved verification metrics to ${outputReportPath}`);

  // Clean up downloaded txt file from tests directory after verification
  if (fs.existsSync(downloadPath)) {
    fs.unlinkSync(downloadPath);
  }

  await browser.close();
  server.close();

  return metrics;
}

if (require.main === module) {
  runPhase3BrowserVerification().catch((err) => {
    console.error('Phase 3 Real-Browser Verification Failed:', err);
    process.exit(1);
  });
}

module.exports = { runPhase3BrowserVerification };
