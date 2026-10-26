import http.server
import socketserver
import threading
import os
import sys
import time
from playwright.sync_api import sync_playwright

PORT = 8094
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
    output_dir = os.path.join(ROOT_DIR, "artifacts", "design-review", "blog-inspection")
    os.makedirs(output_dir, exist_ok=True)

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(1)

    viewports = [
        {"name": "desktop", "width": 1440, "height": 900},
        {"name": "tablet", "width": 768, "height": 1024},
        {"name": "mobile", "width": 390, "height": 844},
    ]

    pages_to_test = [
        {"url_path": "/blog/index.html", "prefix": "blog_index"},
        {"url_path": "/blog/free-pdf-converters-privacy-risk/index.html", "prefix": "blog_post"},
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for p_info in pages_to_test:
            for vp in viewports:
                context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
                page = context.new_page()

                page.goto(f"http://localhost:{PORT}{p_info['url_path']}")
                page.wait_for_load_state("networkidle")

                out_path = os.path.join(output_dir, f"{p_info['prefix']}_{vp['name']}.png")
                page.screenshot(path=out_path, full_page=True)
                print(f"Captured {out_path}")

                context.close()

        browser.close()

if __name__ == "__main__":
    main()
