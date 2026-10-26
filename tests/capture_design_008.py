import http.server
import socketserver
import threading
import os
import sys
import time
from playwright.sync_api import sync_playwright

PORT = 8095
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
    output_dir = os.path.join(ROOT_DIR, "artifacts", "design-review", "DESIGN-008", "after")
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

        # 1. Blog Index (/blog/index.html)
        for vp in viewports:
            context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
            page = context.new_page()

            page.goto(f"http://localhost:{PORT}/blog/index.html")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(800)  # Wait for card reveal animations to settle

            normal_path = os.path.join(output_dir, f"blog_index_{vp['name']}_normal.png")
            page.screenshot(path=normal_path, full_page=True)
            print(f"Captured {normal_path}")

            # Hover first blog card
            card1 = page.query_selector(".blog-card")
            if card1:
                card1.hover(force=True)
                page.wait_for_timeout(200)
                hover_path = os.path.join(output_dir, f"blog_index_{vp['name']}_hover.png")
                page.screenshot(path=hover_path, full_page=True)
                print(f"Captured {hover_path}")

                card1.focus()
                page.wait_for_timeout(200)
                focus_path = os.path.join(output_dir, f"blog_index_{vp['name']}_focus.png")
                page.screenshot(path=focus_path, full_page=True)
                print(f"Captured {focus_path}")

            context.close()

        # 2. Blog Post (/blog/free-pdf-converters-privacy-risk/index.html)
        for vp in viewports:
            context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
            page = context.new_page()

            page.goto(f"http://localhost:{PORT}/blog/free-pdf-converters-privacy-risk/index.html")
            page.wait_for_load_state("networkidle")

            # Scroll to trigger any reveal observers
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(500)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(800)

            normal_path = os.path.join(output_dir, f"blog_post_{vp['name']}_normal.png")
            page.screenshot(path=normal_path, full_page=True)
            print(f"Captured {normal_path}")

            context.close()

        browser.close()

if __name__ == "__main__":
    main()
