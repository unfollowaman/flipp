const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("CSS prevents horizontal overflow on mobile viewports", () => {
  const cssPath = path.join(__dirname, "..", "css", "styles.src.css");
  const cssContent = fs.readFileSync(cssPath, "utf8");

  // Check html and body overflow-x and max-width settings
  assert.ok(
    /html\s*\{[^}]*overflow-x:\s*hidden/i.test(cssContent),
    "html rule should specify overflow-x: hidden"
  );
  assert.ok(
    /html\s*\{[^}]*max-width:\s*100%/i.test(cssContent),
    "html rule should specify max-width: 100%"
  );
  assert.ok(
    /body\s*\{[^}]*overflow-x:\s*hidden/i.test(cssContent),
    "body rule should specify overflow-x: hidden"
  );
  assert.ok(
    /body\s*\{[^}]*max-width:\s*100%/i.test(cssContent),
    "body rule should specify max-width: 100%"
  );

  // Check homepage-hero-img in mobile breakpoint
  const heroImgMatch = cssContent.match(/\.homepage-hero-img\s*\{([^}]+)\}/g);
  assert.ok(heroImgMatch && heroImgMatch.length >= 2, "Should have responsive homepage-hero-img rules");

  const mobileHeroImgRule = heroImgMatch[heroImgMatch.length - 1];
  assert.ok(
    /max-width:\s*100%/i.test(mobileHeroImgRule),
    "homepage-hero-img mobile rule should specify max-width: 100%"
  );
  assert.ok(
    /width:\s*100%/i.test(mobileHeroImgRule),
    "homepage-hero-img mobile rule should specify width: 100%"
  );
});

test("Compiled minified css/styles.css includes overflow-x and max-width fixes", () => {
  const cssPath = path.join(__dirname, "..", "css", "styles.css");
  const cssContent = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    cssContent.includes("overflow-x:hidden"),
    "Minified CSS should contain overflow-x:hidden"
  );
  assert.ok(
    cssContent.includes("max-width:100%"),
    "Minified CSS should contain max-width:100%"
  );
});
