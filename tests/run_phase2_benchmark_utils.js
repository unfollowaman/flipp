const http = require('http');
const fs = require('fs');
const path = require('path');

function createServer(port = 8080) {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/tools/pdf-to-text/';
    let filePath = path.join(root, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm'
      };
      res.writeHead(200, {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + reqPath);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function executeInBrowserBenchmark(page, config) {
  return await page.evaluate(async (cfg) => {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    const pdfUrl = '/assets/test.pdf';

    const fetchStart = performance.now();
    const pdfResp = await fetch(pdfUrl);
    const arrayBuffer = await pdfResp.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer, useSystemFonts: true }).promise;
    const fetchTimeMs = performance.now() - fetchStart;

    const workerStart = performance.now();
    const worker = await window.Tesseract.createWorker(cfg.lang, cfg.oem ?? 1, cfg.workerParams ?? {});
    if (cfg.tesseractParams) {
      await worker.setParameters(cfg.tesseractParams);
    }
    const workerInitTimeMs = performance.now() - workerStart;

    const results = [];
    const overallStart = performance.now();

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const pageObj = await pdfDoc.getPage(p);
      const viewport = pageObj.getViewport({ scale: cfg.scale || 2.0 });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderStart = performance.now();
      await pageObj.render({ canvasContext: ctx, viewport }).promise;
      const renderTimeMs = performance.now() - renderStart;

      // Apply preprocessing if specified
      if (cfg.preprocessing) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        if (cfg.preprocessing === 'grayscale') {
          for (let i = 0; i < data.length; i += 4) {
            const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = avg;
            data[i + 1] = avg;
            data[i + 2] = avg;
          }
        } else if (cfg.preprocessing === 'contrast') {
          const factor = (259 * (128 + 255)) / (255 * (259 - 128));
          for (let i = 0; i < data.length; i += 4) {
            const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            let color = factor * (avg - 128) + 128;
            color = Math.min(255, Math.max(0, color));
            data[i] = color;
            data[i + 1] = color;
            data[i + 2] = color;
          }
        } else if (cfg.preprocessing === 'binarize') {
          for (let i = 0; i < data.length; i += 4) {
            const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const v = avg < 160 ? 0 : 255;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
          }
        } else if (cfg.preprocessing === 'sharpen') {
          const src = new Uint8ClampedArray(data);
          const w = canvas.width;
          const h = canvas.height;
          const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              let r = 0;
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  const idx = ((y + ky) * w + (x + kx)) * 4;
                  r += src[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                }
              }
              r = Math.min(255, Math.max(0, r));
              const outIdx = (y * w + x) * 4;
              data[outIdx] = r;
              data[outIdx + 1] = r;
              data[outIdx + 2] = r;
            }
          }
        } else if (cfg.preprocessing === 'grayscale_contrast') {
          for (let i = 0; i < data.length; i += 4) {
            const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            let c = avg < 180 ? Math.max(0, avg - 30) : Math.min(255, avg + 20);
            data[i] = c;
            data[i + 1] = c;
            data[i + 2] = c;
          }
        }

        ctx.putImageData(imgData, 0, 0);
      }

      const ocrStart = performance.now();
      const { data: ocrData } = await worker.recognize(canvas);
      const ocrTimeMs = performance.now() - ocrStart;

      canvas.width = 0;
      canvas.height = 0;
      if (typeof pageObj.cleanup === 'function') pageObj.cleanup();

      const rawText = ocrData.text || '';
      const tokens = rawText.split(/\s+/);
      const devanagariTokens = tokens.filter((t) => /[\u0900-\u097F]/.test(t));
      const shortDevTokens = devanagariTokens.filter(
        (t) => t.replace(/[^\u0900-\u097F]/g, '').length <= 2
      );
      const shortTokenRatio =
        devanagariTokens.length > 0 ? shortDevTokens.length / devanagariTokens.length : 0;

      const nullMatches = rawText.match(/\u0000/g);
      const isolatedMatraMatches = rawText.match(/(?:^|\s)[\u093e-\u094c\u0901-\u0903]/g);

      const corruptionPatterns = {
        gerCount: (rawText.match(/\bger\b/gi) || []).length,
        gertCount: (rawText.match(/\bgert\b/gi) || []).length,
        gellCount: (rawText.match(/\bgell\b/gi) || []).length,
        dhalCount: (rawText.match(/\bढल\b/g) || []).length,
        dhuniyaCount: (rawText.match(/\bढुनिया\b/g) || []).length,
        pramuralCount: (rawText.match(/\bप्रमुरल\b/g) || []).length,
        num885Count: (rawText.match(/\b885\b/g) || []).length,
        num1885Count: (rawText.match(/\b1885\b/g) || []).length,
        ofCount: (rawText.match(/\bof\b/gi) || []).length,
        blCount: (rawText.match(/\bBl\b/g) || []).length,
        // Check embedded English word preservation
        civicsCount: (rawText.match(/\bCivics\b/gi) || []).length,
        politicalPartiesCount: (rawText.match(/Political\s+Parties/gi) || []).length,
      };

      results.push({
        pageNumber: p,
        width: viewport.width,
        height: viewport.height,
        renderTimeMs,
        ocrTimeMs,
        textLength: rawText.length,
        totalTokens: tokens.length,
        devanagariTokens: devanagariTokens.length,
        shortTokenRatio,
        nullCount: nullMatches ? nullMatches.length : 0,
        isolatedMatraCount: isolatedMatraMatches ? isolatedMatraMatches.length : 0,
        corruptionPatterns,
        rawText,
      });
    }

    const totalTimeMs = performance.now() - overallStart;
    await worker.terminate();
    if (typeof pdfDoc.destroy === 'function') await pdfDoc.destroy();

    return {
      config: cfg,
      fetchTimeMs,
      workerInitTimeMs,
      totalTimeMs,
      avgOcrTimePerPageMs:
        results.reduce((acc, r) => acc + r.ocrTimeMs, 0) / results.length,
      avgRenderTimePerPageMs:
        results.reduce((acc, r) => acc + r.renderTimeMs, 0) / results.length,
      totalPages: results.length,
      pageResults: results,
    };
  }, config);
}

module.exports = { createServer, executeInBrowserBenchmark };
