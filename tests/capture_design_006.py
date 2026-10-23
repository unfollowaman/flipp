import http.server
import socketserver
import threading
import os
import sys
import time
from playwright.sync_api import sync_playwright

PORT = 8092
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

    output_dir = os.path.join(ROOT_DIR, "artifacts", "design-review", "DESIGN-006", mode)
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

            page.goto(f"http://localhost:{PORT}/tools/add-page-numbers/index.html")
            page.wait_for_load_state("networkidle")

            # Make options bar visible for screenshot verification
            page.evaluate('''() => {
              const optBar = document.querySelector(".options-bar");
              if (optBar) {
                optBar.classList.add("is-visible");
                optBar.style.maxHeight = "none";
                optBar.style.opacity = "1";
                optBar.style.pointerEvents = "auto";
              }
            }''')
            page.wait_for_timeout(300)

            # Capture standard normal state
            normal_path = os.path.join(output_dir, f"{vp['name']}_normal.png")
            page.screenshot(path=normal_path)
            print(f"Captured {normal_path}")

            # Capture focus state on range-input and position-card
            input_el = page.query_selector('.range-input')
            if input_el:
                input_el.scroll_into_view_if_needed()
                input_el.focus()
                page.wait_for_timeout(200)
                focus_path = os.path.join(output_dir, f"{vp['name']}_input_focus.png")
                page.screenshot(path=focus_path)
                print(f"Captured {focus_path}")

            pos_card = page.query_selector('.position-card')
            if pos_card:
                pos_card.scroll_into_view_if_needed()
                pos_card.hover(force=True)
                page.wait_for_timeout(200)
                hover_path = os.path.join(output_dir, f"{vp['name']}_card_hover.png")
                page.screenshot(path=hover_path)
                print(f"Captured {hover_path}")

            context.close()

        browser.close()

if __name__ == "__main__":
    main()
