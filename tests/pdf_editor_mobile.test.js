const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("PDF Editor mobile stylesheet contains touch-friendly target rules for <=600px viewports", () => {
  const cssSrcPath = path.join(__dirname, "..", "css", "styles.src.css");
  const cssDistPath = path.join(__dirname, "..", "css", "styles.css");
  const htmlPath = path.join(__dirname, "..", "tools", "edit-pdf", "index.html");

  const cssSrcContent = fs.readFileSync(cssSrcPath, "utf8");
  const cssDistContent = fs.readFileSync(cssDistPath, "utf8");
  const htmlContent = fs.readFileSync(htmlPath, "utf8");

  // Verify responsive media query exists
  assert.ok(
    cssSrcContent.includes("@media (max-width: 600px)"),
    "css/styles.src.css must contain @media (max-width: 600px) media query"
  );
  assert.ok(
    cssDistContent.includes("max-width:600px") || cssDistContent.includes("max-width: 600px"),
    "css/styles.css must contain minified max-width:600px media query"
  );

  // Verify touch targets and scroll properties for .tool-pill and .tool-group
  assert.ok(
    cssSrcContent.includes(".tool-pill") && cssSrcContent.includes("height: 38px"),
    "Mobile styles must define touch-friendly 38px+ height for .tool-pill"
  );
  assert.ok(
    cssSrcContent.includes("-webkit-overflow-scrolling: touch"),
    "Mobile .tool-group must have -webkit-overflow-scrolling: touch for smooth mobile scrolling"
  );
  assert.ok(
    cssSrcContent.includes("touch-action: pan-x"),
    "Mobile .tool-group must specify touch-action: pan-x"
  );

  // Verify mobile inline styles in tools/edit-pdf/index.html
  assert.ok(
    htmlContent.includes(".tool-group") && htmlContent.includes("touch-action: pan-x"),
    "tools/edit-pdf/index.html inline style block must include mobile tool-group touch rules"
  );
  assert.ok(
    htmlContent.includes(".tool-pill") && htmlContent.includes("height: 38px"),
    "tools/edit-pdf/index.html inline style block must include mobile tool-pill 38px height"
  );
});

test("PDF Editor mobile layout contains flexible filename wrap and touch control heights", () => {
  const htmlPath = path.join(__dirname, "..", "tools", "edit-pdf", "index.html");
  const htmlContent = fs.readFileSync(htmlPath, "utf8");

  assert.ok(
    htmlContent.includes("flex-wrap: wrap;") && htmlContent.includes(".editor-single-toolbar"),
    "Mobile toolbar must allow flex wrapping on narrow screens"
  );
  assert.ok(
    htmlContent.includes(".editor-btn") && htmlContent.includes("min-height: 36px"),
    "Mobile editor buttons must specify minimum height of at least 36px"
  );
});
