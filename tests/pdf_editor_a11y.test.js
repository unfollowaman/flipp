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

test("PDF Editor toolbar container and toggle buttons have proper ARIA attributes", () => {
  const htmlPath = path.join(__dirname, "..", "tools", "edit-pdf", "index.html");
  const htmlContent = fs.readFileSync(htmlPath, "utf8");

  assert.ok(
    htmlContent.includes('id="editor-toolbar"') &&
    htmlContent.includes('role="toolbar"') &&
    htmlContent.includes('aria-label="PDF editing tools"'),
    "Editor toolbar must have role='toolbar' and aria-label='PDF editing tools'"
  );

  const tools = ["select", "text", "highlight", "draw", "shape", "image", "note", "signature"];
  tools.forEach((tool) => {
    const regex = new RegExp(`<button[^>]*data-tool="${tool}"[^>]*aria-pressed="(true|false)"`, "i");
    const match = htmlContent.match(regex);
    assert.ok(match, `Tool button data-tool="${tool}" should have an aria-pressed attribute ("true" or "false")`);
  });

  ["prop-bold", "prop-italic"].forEach((id) => {
    const regex = new RegExp(`<button[^>]*id="${id}"[^>]*aria-pressed="(true|false)"`, "i");
    const match = htmlContent.match(regex);
    assert.ok(match, `Formatting button #${id} should have an aria-pressed attribute`);
  });
});

test("PDF Editor Signature Modal accessibility attributes", () => {
  const htmlPath = path.join(__dirname, "..", "tools", "edit-pdf", "index.html");
  const htmlContent = fs.readFileSync(htmlPath, "utf8");

  assert.ok(
    htmlContent.includes('id="editor-sig-modal"') &&
    htmlContent.includes('role="dialog"') &&
    htmlContent.includes('aria-modal="true"') &&
    htmlContent.includes('aria-labelledby="editor-sig-modal-title"'),
    "Signature modal overlay must have role='dialog', aria-modal='true', and aria-labelledby"
  );

  assert.ok(
    htmlContent.includes('id="editor-sig-modal-title"'),
    "Signature modal title must have id='editor-sig-modal-title'"
  );

  assert.ok(
    htmlContent.includes('id="sig-pad-canvas"') &&
    htmlContent.includes('aria-label="Signature drawing canvas"'),
    "Signature canvas must have aria-label"
  );

  assert.ok(
    htmlContent.includes('aria-checked="true"') &&
    htmlContent.includes('aria-checked="false"'),
    "Signature option pills must have aria-checked attributes"
  );
});
