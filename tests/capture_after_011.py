import os
import time
import subprocess
from playwright.sync_api import sync_playwright

def run():
    # Create target directory
    os.makedirs("artifacts/design-review/EDIT-PDF-011/after", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)

    # Start local server
    server_process = subprocess.Popen(["python3", "-m", "http.server", "8080"])
    time.sleep(1)

    captured_video_paths = []

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

                # Select Text Tool
                text_tool = page.locator("button[data-tool='text']")
                if text_tool.is_visible():
                    text_tool.click()
                    page.wait_for_timeout(300)

                    # Click on page overlay to place text object
                    overlay = page.locator(".pdf-page-overlay").first
                    if overlay.is_visible():
                        box = overlay.bounding_box()
                        if box:
                            page.mouse.click(box["x"] + 150, box["y"] + 100)
                            page.wait_for_timeout(500)

                screenshot_path = f"artifacts/design-review/EDIT-PDF-011/after/{label}.png"
                page.screenshot(path=screenshot_path)
                if label == "desktop":
                    page.screenshot(path="/home/jules/verification/screenshots/text_bg_padding_verification.png")
                print(f"Captured after screenshot: {screenshot_path}")

                context.close()
                if page.video:
                    v_path = page.video.path()
                    captured_video_paths.append(v_path)

            browser.close()
    finally:
        server_process.terminate()

    print("Captured video paths:", captured_video_paths)

if __name__ == "__main__":
    run()
