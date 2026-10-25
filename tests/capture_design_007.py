import http.server
import socketserver
import threading
import os
import sys
import time
from playwright.sync_api import sync_playwright

PORT = 8093
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

    output_dir = os.path.join(ROOT_DIR, "artifacts", "design-review", "DESIGN-007", mode)
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

            page.goto(f"http://localhost:{PORT}/tools/merge-pdf/index.html")
            page.wait_for_load_state("networkidle")

            # Scroll to FAQ section
            faq = page.query_selector(".tcs-faq")
            if faq:
                faq.scroll_into_view_if_needed()
                page.wait_for_timeout(300)

            # 1. Normal state screenshot
            normal_path = os.path.join(output_dir, f"{vp['name']}_normal.png")
            page.screenshot(path=normal_path)
            print(f"Captured {normal_path}")

            # 2. Hover state screenshot on first question button
            btn1 = page.query_selector(".tcs-faq-q")
            if btn1:
                btn1.hover(force=True)
                page.wait_for_timeout(200)
                hover_path = os.path.join(output_dir, f"{vp['name']}_hover.png")
                page.screenshot(path=hover_path)
                print(f"Captured {hover_path}")

            # 3. Focus state screenshot
            if btn1:
                btn1.focus()
                page.wait_for_timeout(200)
                focus_path = os.path.join(output_dir, f"{vp['name']}_focus.png")
                page.screenshot(path=focus_path)
                print(f"Captured {focus_path}")

            # 4. Open/Expanded state screenshot
            if btn1:
                btn1.click()
                page.wait_for_timeout(300)
                open_path = os.path.join(output_dir, f"{vp['name']}_open.png")
                page.screenshot(path=open_path)
                print(f"Captured {open_path}")

            context.close()

        browser.close()

if __name__ == "__main__":
    main()
