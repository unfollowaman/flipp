const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TOOL_PAGES = [
  'add-page-numbers',
  'add-watermark',
  'compress-pdf',
  'delete-pdf-pages',
  'edit-pdf',
  'images-to-pdf',
  'merge-pdf',
  'pdf-to-png',
  'pdf-to-text',
  'pdf-to-word',
  'protect-pdf',
  'rearrange-pdf',
  'sign-pdf',
  'split-pdf',
  'unlock-pdf'
];

test('Standardized drag and drop menus across all tool pages', async (t) => {
  await t.test('All 15 tool pages have standardized drop-zone elements and consistent hierarchy', () => {
    for (const tool of TOOL_PAGES) {
      const htmlPath = path.join(__dirname, '..', 'tools', tool, 'index.html');
      assert.ok(fs.existsSync(htmlPath), `${tool} index.html should exist`);
      const html = fs.readFileSync(htmlPath, 'utf8');

      // Verify drop-zone exists
      assert.ok(html.includes('class="drop-zone"'), `${tool} must have a drop-zone element`);

      // Extract primary drop zone block
      const dzIdx = html.indexOf('class="drop-zone"');
      const tagStart = html.lastIndexOf('<div', dzIdx);

      let depth = 0;
      let curr = tagStart;
      let closeTagEnd = -1;
      while (curr < html.length) {
        const nextOpen = html.indexOf('<div', curr);
        const nextClose = html.indexOf('</div>', curr);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          curr = nextOpen + 4;
        } else {
          depth--;
          curr = nextClose + 6;
          if (depth === 0) {
            closeTagEnd = curr;
            break;
          }
        }
      }

      assert.ok(closeTagEnd > -1, `${tool} drop zone should be properly closed`);
      const dzBlock = html.substring(tagStart, closeTagEnd);

      // Verify standardized elements inside drop-zone
      assert.ok(dzBlock.includes('class="dz-content"'), `${tool} must include .dz-content`);
      assert.ok(dzBlock.includes('class="dz-upload-icon"'), `${tool} must include .dz-upload-icon`);
      assert.ok(dzBlock.includes('class="dz-headline"'), `${tool} must include .dz-headline`);
      assert.ok(dzBlock.includes('class="dz-subtext"'), `${tool} must include .dz-subtext`);
      assert.ok(dzBlock.includes('class="dz-browse-btn"'), `${tool} must include .dz-browse-btn`);
      assert.ok(dzBlock.includes('class="dz-formats"'), `${tool} must include .dz-formats`);

      // Verify file input exists
      assert.ok(dzBlock.includes('<input'), `${tool} must include an input element`);
      assert.ok(dzBlock.includes('type="file"'), `${tool} input must be type="file"`);
      assert.ok(dzBlock.includes('hidden'), `${tool} input must be hidden`);
    }
  });

  await t.test('CSS styles define standardized dimensions, min-height, and flex centering for drop-zone', () => {
    const cssSrcPath = path.join(__dirname, '..', 'css', 'styles.src.css');
    const cssContent = fs.readFileSync(cssSrcPath, 'utf8');

    // Check .drop-zone rules
    assert.ok(cssContent.includes('min-height: 280px;'), 'styles.src.css must specify min-height: 280px for .drop-zone');
    assert.ok(cssContent.includes('padding: 48px 32px;'), 'styles.src.css must specify padding: 48px 32px for .drop-zone');
    assert.ok(cssContent.includes('box-sizing: border-box;'), 'styles.src.css must specify box-sizing: border-box for .drop-zone');
    assert.ok(cssContent.includes('display: flex;'), 'styles.src.css must specify display: flex for .drop-zone');
    assert.ok(cssContent.includes('justify-content: center;'), 'styles.src.css must center drop-zone content');
    assert.ok(cssContent.includes('align-items: center;'), 'styles.src.css must vertically center drop-zone content');

    // Check .dz-content rules
    assert.ok(cssContent.includes('.dz-content {'), 'styles.src.css must include .dz-content rule');
    assert.ok(cssContent.includes('width: 100%;'), '.dz-content must take 100% width');

    // Check mobile responsive min-height
    assert.ok(cssContent.includes('min-height: 220px;'), 'styles.src.css must specify mobile responsive min-height: 220px');

    // Check compiled CSS
    const compiledPath = path.join(__dirname, '..', 'css', 'styles.css');
    const compiledContent = fs.readFileSync(compiledPath, 'utf8');
    assert.ok(compiledContent.includes('min-height:280px'), 'styles.css must include min-height:280px');
    assert.ok(compiledContent.includes('min-height:220px'), 'styles.css must include min-height:220px');
  });
});
