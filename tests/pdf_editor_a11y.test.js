const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("PDF Editor toolbar and control buttons have aria-label attributes", () => {
  const htmlPath = path.join(__dirname, "..", "tools", "edit-pdf", "index.html");
  const htmlContent = fs.readFileSync(htmlPath, "utf8");

  const buttonIdsToVerify = [
    "editor-undo-btn",
    "editor-redo-btn",
    "prop-bold",
    "prop-italic",
    "editor-delete-obj",
    "editor-prev-page",
    "editor-next-page",
    "editor-zoom-out",
    "editor-zoom-in"
  ];

  buttonIdsToVerify.forEach((id) => {
    const regex = new RegExp(`<button[^>]*id="${id}"[^>]*aria-label="([^"]+)"`, "i");
    const match = htmlContent.match(regex);
    assert.ok(match, `Button #${id} should have an aria-label attribute`);
    assert.ok(match[1] && match[1].trim().length > 0, `Button #${id} aria-label should not be empty`);
  });

  const tools = ["select", "text", "highlight", "draw", "shape", "image", "note", "signature"];
  tools.forEach((tool) => {
    const regex = new RegExp(`<button[^>]*data-tool="${tool}"[^>]*aria-label="([^"]+)"`, "i");
    const match = htmlContent.match(regex);
    assert.ok(match, `Tool button data-tool="${tool}" should have an aria-label attribute`);
    assert.ok(match[1] && match[1].trim().length > 0, `Tool button data-tool="${tool}" aria-label should not be empty`);
  });
});
