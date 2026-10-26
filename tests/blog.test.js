const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

describe('Blog Section & Blog Pages Design Polish', () => {
  const srcCss = fs.readFileSync(path.join(__dirname, '../css/styles.src.css'), 'utf8');
  const compiledCss = fs.readFileSync(path.join(__dirname, '../css/styles.css'), 'utf8');
  const cardRevealCss = fs.readFileSync(path.join(__dirname, '../css/card-reveal.css'), 'utf8');
  const cardRevealJs = fs.readFileSync(path.join(__dirname, '../js/card-reveal.js'), 'utf8');

  it('blog cards specify tactile offset shadow and smooth transition', () => {
    assert.match(srcCss, /\.blog-card\s*\{[^}]*box-shadow:\s*3\.5px\s+3\.5px\s+0\s+var\(--black\)/);
    assert.match(srcCss, /\.blog-card:hover\s*\{[^}]*box-shadow:\s*6px\s+6px\s+0\s+var\(--black\)/);
    assert.match(srcCss, /\.blog-card:active\s*\{[^}]*box-shadow:\s*1\.5px\s+1\.5px\s+0\s+var\(--black\)/);
    assert.match(srcCss, /\.blog-card:focus-visible\s*\{[^}]*outline:\s*3px\s+solid\s+var\(--black\)/);
  });

  it('blog card icons specify neo-brutalist border and tactile shadow', () => {
    assert.match(srcCss, /\.blog-card-icon\s*\{[^}]*border:\s*1\.5px\s+solid\s+var\(--black\)/);
    assert.match(srcCss, /\.blog-card-icon\s*\{[^}]*box-shadow:\s*1\.5px\s+1\.5px\s+0\s+var\(--black\)/);
    assert.match(srcCss, /\.blog-card:hover\s+\.blog-card-icon\s*\{[^}]*transform:\s*scale\(1\.08\)\s+rotate\(2deg\)/);
  });

  it('blog tools CTA and CTA box containers specify 4px tactile offset shadow', () => {
    assert.match(srcCss, /\.blog-cta-box\s*\{[^}]*box-shadow:\s*4px\s+4px\s+0\s+var\(--black\)/);
    assert.match(srcCss, /\.blog-tools-cta\s*\{[^}]*box-shadow:\s*4px\s+4px\s+0\s+var\(--black\)/);
    assert.match(srcCss, /\.blog-tools-cta-pill\s*\{[^}]*box-shadow:\s*2px\s+2px\s+0\s+var\(--black\)/);
    assert.match(srcCss, /\.blog-tools-cta-item:focus-visible\s*\{[^}]*outline:\s*3px\s+solid\s+var\(--black\)/);
  });

  it('pull quote specifies full neo-brutalist border and offset shadow', () => {
    assert.match(srcCss, /\.pull-quote\s*\{[^}]*border:\s*var\(--border-std\)/);
    assert.match(srcCss, /\.pull-quote\s*\{[^}]*border-left:\s*6px\s+solid\s+var\(--black\)/);
    assert.match(srcCss, /\.pull-quote\s*\{[^}]*box-shadow:\s*3px\s+3px\s+0\s+var\(--black\)/);
  });

  it('card reveal CSS and JS include blog card inner elements in selectors', () => {
    assert.ok(cardRevealCss.includes('.blog-card-icon'));
    assert.ok(cardRevealCss.includes('.blog-card-badge'));
    assert.ok(cardRevealCss.includes('.blog-card-title'));
    assert.ok(cardRevealCss.includes('.blog-card-desc'));
    assert.ok(cardRevealCss.includes('.blog-card-arrow'));

    assert.ok(cardRevealJs.includes('.blog-card-icon'));
    assert.ok(cardRevealJs.includes('.blog-card-badge'));
    assert.ok(cardRevealJs.includes('.blog-card-title'));
    assert.ok(cardRevealJs.includes('.blog-card-desc'));
    assert.ok(cardRevealJs.includes('.blog-card-arrow'));
  });

  it('compiled styles.css includes updated blog styling', () => {
    assert.ok(compiledCss.includes('.blog-card'));
    assert.ok(compiledCss.includes('.blog-tools-cta'));
    assert.ok(compiledCss.includes('.blog-card-icon'));
  });
});
