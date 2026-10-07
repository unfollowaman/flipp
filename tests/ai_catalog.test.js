const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("ai-catalog.json manifest existence, schema, and configuration", async (t) => {
  const rootDir = path.resolve(__dirname, "..");
  const catalogPath = path.join(rootDir, "ai-catalog.json");

  await t.test("ai-catalog.json exists in root and is valid JSON", () => {
    assert.strictEqual(
      fs.existsSync(catalogPath),
      true,
      "ai-catalog.json must exist in repository root"
    );

    const rawContent = fs.readFileSync(catalogPath, "utf-8");
    assert.doesNotThrow(() => {
      JSON.parse(rawContent);
    }, "ai-catalog.json must parse cleanly as valid JSON");
  });

  await t.test("ai-catalog.json satisfies expected AI catalog schema structure", () => {
    const rawContent = fs.readFileSync(catalogPath, "utf-8");
    const catalog = JSON.parse(rawContent);

    assert.ok(typeof catalog.name === "string" && catalog.name.trim().length > 0, "name is required");
    assert.ok(typeof catalog.description === "string" && catalog.description.trim().length > 0, "description is required");
    assert.ok(typeof catalog.url === "string" && catalog.url.startsWith("https://"), "url must be valid https URL");
    assert.ok(typeof catalog.version === "string" && catalog.version.trim().length > 0, "version is required");

    assert.ok(typeof catalog.provider === "object" && catalog.provider !== null, "provider object is required");
    assert.ok(typeof catalog.provider.name === "string" && catalog.provider.name.trim().length > 0, "provider.name is required");
    assert.ok(typeof catalog.provider.url === "string" && catalog.provider.url.startsWith("https://"), "provider.url must be valid https URL");

    assert.ok(Array.isArray(catalog.categories) && catalog.categories.length > 0, "categories must be a non-empty array");
    for (const cat of catalog.categories) {
      assert.ok(typeof cat.id === "string" && cat.id.length > 0, "category id is required");
      assert.ok(typeof cat.name === "string" && cat.name.length > 0, "category name is required");
      assert.ok(typeof cat.description === "string" && cat.description.length > 0, "category description is required");
      assert.ok(typeof cat.url === "string" && cat.url.startsWith("https://"), "category url must be valid https URL");
    }

    assert.ok(Array.isArray(catalog.pages) && catalog.pages.length > 0, "pages must be a non-empty array");
    for (const page of catalog.pages) {
      assert.ok(typeof page.title === "string" && page.title.length > 0, "page title is required");
      assert.ok(typeof page.url === "string" && page.url.startsWith("https://"), "page url must be valid https URL");
      assert.ok(typeof page.description === "string" && page.description.length > 0, "page description is required");
    }
  });

  await t.test("_headers explicitly configures /ai-catalog.json Content-Type and CORS", () => {
    const headersPath = path.join(rootDir, "_headers");
    assert.strictEqual(fs.existsSync(headersPath), true, "_headers file must exist");

    const headersContent = fs.readFileSync(headersPath, "utf-8");
    assert.ok(
      headersContent.includes("/ai-catalog.json"),
      "_headers must contain a section for /ai-catalog.json"
    );
    assert.ok(
      headersContent.includes("Content-Type: application/json"),
      "_headers must set Content-Type: application/json for /ai-catalog.json"
    );
  });

  await t.test(".cloudflareignore does not exclude ai-catalog.json", () => {
    const cfIgnorePath = path.join(rootDir, ".cloudflareignore");
    if (fs.existsSync(cfIgnorePath)) {
      const cfIgnoreContent = fs.readFileSync(cfIgnorePath, "utf-8");
      assert.strictEqual(
        cfIgnoreContent.includes("ai-catalog.json"),
        false,
        ".cloudflareignore must not exclude ai-catalog.json"
      );
    }
  });
});
