const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto('http://localhost:8080/tools/merge-pdf/');

  const fileInput = await page.$('#merge-file-input');

  await fileInput.setInputFiles(['normal.pdf', 'normal.pdf']);

  await page.click('#merge-btn');

  await new Promise(r => setTimeout(r, 2000));

  const isVisible = await page.evaluate(() => {
    return document.getElementById('merge-results').classList.contains('is-visible');
  });
  console.log('Is results area visible:', isVisible);

  const previewAreaVisible = await page.evaluate(() => {
    return document.getElementById('merge-preview-area').classList.contains('is-visible');
  });
  console.log('Is preview area visible:', previewAreaVisible);

  await browser.close();
})();
