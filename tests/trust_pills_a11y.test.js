const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("Trust pills accessibility in index.html", () => {
  const htmlPath = path.join(__dirname, "..", "index.html");
  const htmlContent = fs.readFileSync(htmlPath, "utf8");

  // Find all <a> tags that have class containing "trust-pill"
  const aTagRegex = /<a\b[^>]*class="[^"]*trust-pill[^"]*"[^>]*>([\s\S]*?)<\/a\s*>/gi;
  const genuineMatches = [];
  let match;
  while ((match = aTagRegex.exec(htmlContent)) !== null) {
    const fullTag = match[0];
    const text = match[1].trim();
    const hrefMatch = fullTag.match(/href="([^"]+)"/i);
    genuineMatches.push({
      href: hrefMatch ? hrefMatch[1] : null,
      text,
      fullTag,
    });
  }

  assert.strictEqual(
    genuineMatches.length,
    6,
    "Should have exactly 6 genuine interactive trust pill links"
  );

  genuineMatches.forEach((pill) => {
    assert.ok(
      pill.href && pill.href.includes("./blog/"),
      `Genuine pill href (${pill.href}) should point to a blog post`
    );
    assert.ok(
      !pill.fullTag.includes('aria-hidden="true"'),
      `Genuine pill tag (${pill.fullTag}) must not have aria-hidden="true"`
    );
  });

  // Find all <span> tags that have class containing "trust-pill" and aria-hidden="true"
  const spanTagRegex = /<span\b[^>]*class="[^"]*trust-pill[^"]*"[^>]*aria-hidden="true"[^>]*>([\s\S]*?)<\/span\s*>/gi;
  const decorativeMatches = [];
  while ((match = spanTagRegex.exec(htmlContent)) !== null) {
    decorativeMatches.push({
      text: match[1].trim(),
      fullTag: match[0],
    });
  }

  assert.strictEqual(
    decorativeMatches.length,
    6,
    "Should have exactly 6 decorative trust pill clones as aria-hidden spans"
  );

  // Check that NO aria-hidden="true" element in index.html is focusable or contains focusable elements
  const ariaHiddenRegex = /<([a-z0-9-]+)\b[^>]*\baria-hidden="true"\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let ariaHiddenMatch;
  while ((ariaHiddenMatch = ariaHiddenRegex.exec(htmlContent)) !== null) {
    const tagName = ariaHiddenMatch[1].toLowerCase();
    const tagContent = ariaHiddenMatch[2];
    const fullElement = ariaHiddenMatch[0];

    // The element itself must not be a focusable tag like <a href="..."> or <button>
    assert.notStrictEqual(
      tagName,
      "button",
      `aria-hidden element cannot be a <button>: ${fullElement}`
    );
    if (tagName === "a") {
      assert.ok(
        !/href=/i.test(fullElement),
        `aria-hidden <a> element cannot have an href attribute: ${fullElement}`
      );
    }

    // The element content must not contain focusable descendants
    assert.ok(
      !/<a\s+[^>]*href=/i.test(tagContent),
      `aria-hidden element content cannot contain focusable <a> link: ${fullElement}`
    );
    assert.ok(
      !/<button/i.test(tagContent),
      `aria-hidden element content cannot contain <button>: ${fullElement}`
    );
    assert.ok(
      !/<input/i.test(tagContent),
      `aria-hidden element content cannot contain <input>: ${fullElement}`
    );
  }
});
