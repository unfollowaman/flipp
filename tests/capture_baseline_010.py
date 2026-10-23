import os
import time
import subprocess
from playwright.sync_api import sync_playwright

def run():
    # Start local server if needed
    server_process = subprocess.Popen(["python3", "-m", "http.server", "8080"])
    time.sleep(1)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            viewports = [
                ("desktop", 1440, 900),
                ("tablet", 768, 1024),
                ("mobile", 390, 844)
            ]

            for label, width, height in viewports:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    device_scale_factor=2, # High-DPI Retina screen
                    record_video_dir="/home/jules/verification/videos"
                )
                page = context.new_page()

                page.goto("http://localhost:8080/tools/edit-pdf/index.html")
                page.wait_for_timeout(500)

                # Select PDF file
                file_input = page.locator("#editor-file-input")
                test_pdf = os.path.abspath("assets/test.pdf")
                file_input.set_input_files(test_pdf)
                page.wait_for_timeout(1000)

                # Select Draw Tool
                draw_tool = page.locator("button[data-tool='draw']")
                if draw_tool.is_visible():
                    draw_tool.click()
                    page.wait_for_timeout(300)

                    # Perform draw drag on page overlay
                    overlay = page.locator(".pdf-page-overlay").first
                    if overlay.is_visible():
                        box = overlay.bounding_box()
                        if box:
                            page.mouse.move(box["x"] + 100, box["y"] + 100)
                            page.mouse.down()
                            page.mouse.move(box["x"] + 200, box["y"] + 150)
                            page.mouse.move(box["x"] + 250, box["y"] + 100)
                            page.mouse.up()
                            page.wait_for_timeout(500)

                screenshot_path = f"artifacts/design-review/EDIT-PDF-010/before/{label}.png"
                page.screenshot(path=screenshot_path)
                print(f"Captured baseline screenshot: {screenshot_path}")

                context.close()

            browser.close()
    finally:
        server_process.terminate()

if __name__ == "__main__":
    run()
