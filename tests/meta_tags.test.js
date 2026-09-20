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

test('Open Graph and Twitter meta tags validation', () => {
  const rootDir = process.cwd();
  const htmlFiles = getHtmlFiles(rootDir);

  assert.ok(htmlFiles.length > 0, 'Should find HTML files in repository');

  for (const filePath of htmlFiles) {
    const relativePath = path.relative(rootDir, filePath);
    if (relativePath === '404.html') {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // og:site_name
    assert.ok(
      content.includes('property="og:site_name"') || content.includes("property='og:site_name'"),
      `File ${relativePath} should contain og:site_name meta tag`
    );

    // og:title
    assert.ok(
      content.includes('property="og:title"') || content.includes("property='og:title'"),
      `File ${relativePath} should contain og:title meta tag`
    );

    // og:description
    assert.ok(
      content.includes('property="og:description"') || content.includes("property='og:description'"),
      `File ${relativePath} should contain og:description meta tag`
    );

    // og:url
    assert.ok(
      content.includes('property="og:url"') || content.includes("property='og:url'"),
      `File ${relativePath} should contain og:url meta tag`
    );

    // twitter:card
    assert.ok(
      content.includes('name="twitter:card"') || content.includes("name='twitter:card'"),
      `File ${relativePath} should contain twitter:card meta tag`
    );

    // twitter:title
    assert.ok(
      content.includes('name="twitter:title"') || content.includes("name='twitter:title'"),
      `File ${relativePath} should contain twitter:title meta tag`
    );

    // twitter:description
    assert.ok(
      content.includes('name="twitter:description"') || content.includes("name='twitter:description'"),
      `File ${relativePath} should contain twitter:description meta tag`
    );

    // twitter:image
    assert.ok(
      content.includes('name="twitter:image"') || content.includes("name='twitter:image'"),
      `File ${relativePath} should contain twitter:image meta tag`
    );

    // Must reference ogimage.png (not unsupported ogimage.avif for social cards)
    assert.ok(
      content.includes('https://tryflipp.pages.dev/assets/ogimage/ogimage.png'),
      `File ${relativePath} should reference absolute URL for ogimage.png`
    );

    assert.ok(
      !content.includes('ogimage.avif'),
      `File ${relativePath} should not reference ogimage.avif for Open Graph image`
    );

    // Width and height
    assert.ok(
      content.includes('property="og:image:width"') && content.includes('content="1200"'),
      `File ${relativePath} should contain og:image:width meta tag set to 1200`
    );
    assert.ok(
      content.includes('property="og:image:height"') && content.includes('content="630"'),
      `File ${relativePath} should contain og:image:height meta tag set to 630`
    );
  }
});

test('OG PNG image existence and dimensions validation', () => {
  const ogImagePath = path.join(process.cwd(), 'assets', 'ogimage', 'ogimage.png');
  assert.ok(fs.existsSync(ogImagePath), 'assets/ogimage/ogimage.png should exist');

  const buffer = fs.readFileSync(ogImagePath);
  assert.ok(
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47,
    'ogimage.png should be a valid PNG file'
  );

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  assert.equal(width, 1200, 'OG image width should be 1200');
  assert.equal(height, 630, 'OG image height should be 630');
});
