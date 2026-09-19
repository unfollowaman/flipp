import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function getHtmlFiles(dir) {
  const results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results.push(...getHtmlFiles(res));
      }
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(res);
    }
  }
  return results;
}

test('all HTML files have valid favicon and icon link tags', () => {
  const rootDir = path.resolve(process.cwd());
  const htmlFiles = getHtmlFiles(rootDir);

  assert.ok(htmlFiles.length >= 30, `Expected at least 30 HTML files, found ${htmlFiles.length}`);

  const requiredIconTypes = [
    'image/svg+xml',
    '32x32',
    '16x16',
    'apple-touch-icon'
  ];

  for (const filePath of htmlFiles) {
    const relPath = path.relative(rootDir, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract all <link> elements inside <head>
    const headMatch = content.match(/<head[\s\S]*?<\/head>/i);
    assert.ok(headMatch, `${relPath} should have a <head> section`);

    const headContent = headMatch[0];

    // Find link tags with rel containing icon or apple-touch-icon
    const linkRegex = /<link\b[^>]*>/gi;
    const iconLinks = [];
    let match;

    while ((match = linkRegex.exec(headContent)) !== null) {
      const tag = match[0];
      if (/rel=["'](?:shortcut icon|icon|apple-touch-icon)["']/i.test(tag)) {
        iconLinks.push(tag);
      }
    }

    assert.ok(
      iconLinks.length >= 4,
      `${relPath} should contain at least 4 icon link tags, found ${iconLinks.length}`
    );

    // Verify each link points to a file that exists on disk
    for (const linkTag of iconLinks) {
      const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
      assert.ok(hrefMatch, `${relPath}: link tag missing href attribute: ${linkTag}`);

      const href = hrefMatch[1];
      const fileDir = path.dirname(filePath);
      const targetPath = path.resolve(fileDir, href);

      assert.ok(
        fs.existsSync(targetPath),
        `${relPath}: favicon reference "${href}" resolves to non-existent file "${targetPath}"`
      );
    }

    // Verify all required types/sizes are covered
    for (const reqType of requiredIconTypes) {
      const coversType = iconLinks.some(tag => tag.includes(reqType));
      assert.ok(
        coversType,
        `${relPath} missing icon link tag covering requirement "${reqType}"`
      );
    }
  }
});
