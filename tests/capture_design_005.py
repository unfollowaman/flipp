import http.server
import socketserver
import threading
import os
import sys
import time
from playwright.sync_api import sync_playwright

PORT = 8091
ROOT_DIR = os.getcwd()

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

def run_server():
    try:
        with ReusableTCPServer(("", PORT), Handler) as httpd:
            httpd.serve_forever()
    except Exception as e:
        print(f"Server info: {e}")

def main():
    mode = "before"
    if len(sys.argv) > 1:
        mode = sys.argv[1]

    output_dir = os.path.join(ROOT_DIR, "artifacts", "design-review", "DESIGN-005", mode)
    os.makedirs(output_dir, exist_ok=True)

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(1)

    viewports = [
        {"name": "desktop", "width": 1440, "height": 900},
        {"name": "tablet", "width": 768, "height": 1024},
        {"name": "mobile", "width": 390, "height": 844},
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for vp in viewports:
            context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
            page = context.new_page()

            page.goto(f"http://localhost:{PORT}/tools/pdf-to-png/index.html")
            page.wait_for_load_state("networkidle")

            # Populate results area with dummy result cards for screenshot verification
            page.evaluate('''() => {
              const resultsArea = document.getElementById("pdf-results-area");
              const grid = document.getElementById("pdf-results-grid");
              if (resultsArea && grid) {
                resultsArea.classList.add("is-visible");
                grid.innerHTML = `
                  <div class="result-img-card">
                    <div style="height: 120px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #475569;">Page 1</div>
                    <div class="result-img-actions">
                      <span class="result-img-label">page_1.png</span>
                      <button class="result-download-btn" aria-label="Download page 1">Download</button>
                    </div>
                  </div>
                  <div class="result-img-card">
                    <div style="height: 120px; background: #cbd5e1; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #475569;">Page 2</div>
                    <div class="result-img-actions">
                      <span class="result-img-label">page_2.png</span>
                      <button class="result-download-btn" aria-label="Download page 2">Download</button>
                    </div>
                  </div>
                `;
              }
            }''')
            page.wait_for_timeout(300)

            # Capture standard normal state
            normal_path = os.path.join(output_dir, f"{vp['name']}_normal.png")
            page.screenshot(path=normal_path)
            print(f"Captured {normal_path}")

            # Capture hover state on result card download button
            dl_btn = page.query_selector('.result-download-btn')
            if dl_btn:
                dl_btn.hover()
                page.wait_for_timeout(200)
                hover_path = os.path.join(output_dir, f"{vp['name']}_hover.png")
                page.screenshot(path=hover_path)
                print(f"Captured {hover_path}")

                dl_btn.focus()
                page.wait_for_timeout(200)
                focus_path = os.path.join(output_dir, f"{vp['name']}_focus.png")
                page.screenshot(path=focus_path)
                print(f"Captured {focus_path}")

            context.close()

        browser.close()

if __name__ == "__main__":
    main()
