import http.server
import socketserver
import threading
import os
import sys
import time
from playwright.sync_api import sync_playwright

PORT = 8089
ROOT_DIR = os.getcwd()

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

def run_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

def main():
    mode = "before"
    if len(sys.argv) > 1:
        mode = sys.argv[1]

    output_dir = os.path.join(ROOT_DIR, "artifacts", "design-review", "EDIT-PDF-009", mode)
    os.makedirs(output_dir, exist_ok=True)

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(1)

    test_pdf = os.path.join(ROOT_DIR, "assets", "test.pdf")

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

            page.goto(f"http://localhost:{PORT}/tools/edit-pdf/index.html")
            page.wait_for_load_state("networkidle")

            # Upload test.pdf
            file_input = page.locator("#editor-file-input")
            file_input.set_input_files(test_pdf)

            page.wait_for_selector("#editor-workspace", state="visible", timeout=10000)
            page.wait_for_timeout(1000)

            # Click text tool and place text object
            page.click('.tool-pill[data-tool="text"]')
            page.wait_for_timeout(300)
            overlay = page.locator('.pdf-page-overlay[data-page-num="1"]')
            overlay.click(position={"x": 100, "y": 100})
            page.wait_for_timeout(500)

            screenshot_path = os.path.join(output_dir, f"{vp['name']}.png")
            page.screenshot(path=screenshot_path)
            print(f"Captured {screenshot_path}")

            context.close()

        browser.close()

if __name__ == "__main__":
    main()
