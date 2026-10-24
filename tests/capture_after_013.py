import os
import time
import subprocess
from playwright.sync_api import sync_playwright

def run():
    os.makedirs("artifacts/design-review/EDIT-PDF-013/after", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)

    server_process = subprocess.Popen(["python3", "-m", "http.server", "8086"])
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
                    device_scale_factor=2
                )
                page = context.new_page()

                page.goto("http://localhost:8086/tools/edit-pdf/index.html")
                page.wait_for_timeout(500)

                # Load test PDF
                file_input = page.locator("#editor-file-input")
                test_pdf = os.path.abspath("assets/test.pdf")
                file_input.set_input_files(test_pdf)
                page.wait_for_timeout(1000)

                # Place two objects on canvas (a text box and a shape box)
                text_tool = page.locator("button[data-tool='text']")
                if text_tool.is_visible():
                    text_tool.click()
                    page.wait_for_timeout(200)

                overlay = page.locator(".pdf-page-overlay").first
                if overlay.is_visible():
                    overlay.click(position={"x": 100, "y": 100})
                    page.wait_for_timeout(300)

                shape_tool = page.locator("button[data-tool='shape']")
                if shape_tool.is_visible():
                    shape_tool.click()
                    page.wait_for_timeout(200)
                    overlay.click(position={"x": 300, "y": 100})
                    page.wait_for_timeout(300)

                # Select tool and drag marquee over both objects
                select_tool = page.locator("button[data-tool='select']")
                if select_tool.is_visible():
                    select_tool.click()
                    page.wait_for_timeout(200)

                box = overlay.bounding_box()
                if box:
                    page.mouse.move(box["x"] + 50, box["y"] + 50)
                    page.mouse.down()
                    page.mouse.move(box["x"] + 450, box["y"] + 250)
                    page.mouse.up()
                    page.wait_for_timeout(300)

                screenshot_path = f"artifacts/design-review/EDIT-PDF-013/after/{label}.png"
                page.screenshot(path=screenshot_path)
                if label == "desktop":
                    page.screenshot(path="/home/jules/verification/screenshots/multi_object_selection_verification.png")
                print(f"Captured after screenshot: {screenshot_path}")

                context.close()

            browser.close()
    finally:
        server_process.terminate()

if __name__ == "__main__":
    run()
