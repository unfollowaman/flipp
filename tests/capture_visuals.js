import httpModule from "http";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const PORT = 8089;
const ROOT_DIR = process.cwd();

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

// Simple static HTTP server
function createServer() {
  return httpModule.createServer((req, res) => {
    let filePath = path.join(ROOT_DIR, req.url.split("?")[0]);
    if (filePath.endsWith("/")) {
      filePath = path.join(filePath, "index.html");
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    });
  });
}

async function run() {
  const mode = process.argv[2] || "before";
  const outputDir = path.join(ROOT_DIR, "artifacts", "design-review", "EDIT-PDF-007", mode);
  fs.mkdirSync(outputDir, { recursive: true });

  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Server listening on http://localhost:${PORT}`);

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });

    await page.goto(`http://localhost:${PORT}/tools/edit-pdf/index.html`);
    await page.waitForLoadState("networkidle");

    // Upload test.pdf
    const fileInput = await page.$("#editor-file-input");
    if (fileInput) {
      await fileInput.setInputFiles(path.join(ROOT_DIR, "assets", "test.pdf"));
      // Wait for editor workspace to appear
      await page.waitForSelector("#editor-workspace", { state: "visible", timeout: 10000 });
      await page.waitForTimeout(1500); // Wait for canvas rendering
    }

    // Add a text box to page 1
    const textToolBtn = await page.$('.tool-pill[data-tool="text"]');
    if (textToolBtn) {
      await textToolBtn.click();
      const overlay = await page.$('.pdf-page-overlay[data-page-num="1"]');
      if (overlay) {
        await overlay.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(500);
      }
    }

    const screenshotPath = path.join(outputDir, `${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved screenshot: ${screenshotPath}`);

    await page.close();
  }

  await browser.close();
  server.close();
  console.log("Capture run complete.");
}

run().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
