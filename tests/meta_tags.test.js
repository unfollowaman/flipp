import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function getHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && !file.startsWith('.')) {
        results = results.concat(getHtmlFiles(fullPath));
      }
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  });
  return results;
}

test('Open Graph meta tags validation', () => {
  const rootDir = process.cwd();
  const htmlFiles = getHtmlFiles(rootDir);

  assert.ok(htmlFiles.length > 0, 'Should find HTML files in repository');

  for (const filePath of htmlFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(rootDir, filePath);

    // Skip 404.html or pages without Open Graph metadata
    if (!content.includes('property="og:') && !content.includes("property='og:")) {
      continue;
    }

    assert.ok(
      content.includes('property="og:site_name"') || content.includes("property='og:site_name'"),
      `File ${relativePath} should contain og:site_name meta tag`
    );

    assert.ok(
      content.includes('content="flipp"'),
      `File ${relativePath} og:site_name should have content="flipp"`
    );

    if (content.includes('property="og:image"') || content.includes("property='og:image'")) {
      assert.ok(
        content.includes('property="og:image:width"'),
        `File ${relativePath} should contain og:image:width meta tag`
      );
      assert.ok(
        content.includes('property="og:image:height"'),
        `File ${relativePath} should contain og:image:height meta tag`
      );
      assert.ok(
        content.includes('content="1200"'),
        `File ${relativePath} og:image:width should be 1200`
      );
      assert.ok(
        content.includes('content="630"'),
        `File ${relativePath} og:image:height should be 630`
      );
    }
  }
});

test('OG image dimensions validation', () => {
  const ogImagePath = path.join(process.cwd(), 'assets', 'ogimage', 'ogimage.avif');
  assert.ok(fs.existsSync(ogImagePath), 'assets/ogimage/ogimage.avif should exist');

  const buffer = fs.readFileSync(ogImagePath);
  // Find ispe box in ISOBMFF AVIF file: 4 bytes length, 'ispe', 4 bytes version/flags, 4 bytes width, 4 bytes height
  const ispeIndex = buffer.indexOf(Buffer.from('ispe'));
  assert.notEqual(ispeIndex, -1, 'AVIF should contain an ispe box');

  const width = buffer.readUInt32BE(ispeIndex + 8);
  const height = buffer.readUInt32BE(ispeIndex + 12);

  assert.equal(width, 1200, 'OG image width should be 1200');
  assert.equal(height, 630, 'OG image height should be 630');
});
