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
  const outputDir = path.join(ROOT_DIR, "artifacts", "design-review", "DESIGN-004", mode);
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

    await page.goto(`http://localhost:${PORT}/tools/pdf-to-png/index.html`);
    await page.waitForLoadState("networkidle");

    // Force options bar visible to capture option pills
    await page.evaluate(() => {
      const optionsBar = document.getElementById("pdf-options");
      if (optionsBar) {
        optionsBar.classList.add("is-visible");
      }
    });
    await page.waitForTimeout(300);

    // Capture standard normal state
    await page.screenshot({
      path: path.join(outputDir, `${vp.name}_normal.png`),
      fullPage: false,
    });

    // Capture hover state on inactive pill
    const inactivePill = await page.$('.opt-pill:not(.active)');
    if (inactivePill) {
      await inactivePill.hover();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(outputDir, `${vp.name}_hover.png`),
        fullPage: false,
      });
    }

    // Capture focus state on pill
    if (inactivePill) {
      await inactivePill.focus();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(outputDir, `${vp.name}_focus.png`),
        fullPage: false,
      });
    }

    await page.close();
  }

  await browser.close();
  server.close();
  console.log(`Capture ${mode} complete.`);
}

run().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
