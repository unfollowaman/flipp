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
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: "/home/jules/verification/videos" }
  });

  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/tools/pdf-to-word/index.html`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  const dropZone = await page.$(".drop-zone");
  if (dropZone) {
    await dropZone.hover();
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const dz = document.querySelector(".drop-zone");
      if (dz) dz.classList.add("drag-over");
    });
    await page.waitForTimeout(1000);
  }

  const screenshotPath = "/home/jules/verification/screenshots/verification.png";
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.waitForTimeout(1000);

  await context.close();
  await browser.close();
  server.close();
  console.log("Verification run complete.");
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
