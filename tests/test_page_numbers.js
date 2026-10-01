const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

describe('Add Page Numbers accessibility attributes', () => {
  test('tools/add-page-numbers/index.html uses role="radiogroup" and role="radio" with aria-checked', () => {
    const html = fs.readFileSync('tools/add-page-numbers/index.html', 'utf-8');
    assert.ok(
      html.includes('id="number-page-position"') && html.includes('role="radiogroup"'),
      '#number-page-position container should have role="radiogroup"'
    );
    assert.ok(
      html.includes('role="radio"') && html.includes('aria-checked="true"'),
      'position-card buttons should have role="radio" and aria-checked'
    );
  });

  test('js/pdf-page-numbers.js updates aria-checked attributes on position select and reset', () => {
    const js = fs.readFileSync('js/pdf-page-numbers.js', 'utf-8');
    const checkedMatches = js.match(/setAttribute\("aria-checked",\s*isActive\s*\?\s*"true"\s*:\s*"false"\)/g);
    assert.ok(
      checkedMatches && checkedMatches.length >= 2,
      'js/pdf-page-numbers.js should update aria-checked attribute on position selection and reset'
    );
  });
});
