const test = require('node:test');
const assert = require('node:assert');
const { icon, ICON_PATHS, hydrateIcons } = require('../js/edit-pdf-icons.js');

test('edit-pdf-icons icon function and parameters', async (t) => {
  await t.test('icon("select") returns svg string containing path and stroke-linecap="round"', () => {
    const res = icon('select');
    assert.ok(res.includes('<svg'));
    assert.ok(res.includes('stroke-linecap="round"'));
    assert.ok(res.includes(ICON_PATHS.select));
  });

  await t.test('icon("unknown") returns an empty string', () => {
    assert.strictEqual(icon('unknown'), '');
  });

  await t.test('icon("undo", 20, true) contains scaleX(-1) transform and size 20', () => {
    const res = icon('undo', 20, true);
    assert.ok(res.includes('width="20"'));
    assert.ok(res.includes('height="20"'));
    assert.ok(res.includes('style="transform:scaleX(-1)"'));
  });

  await t.test('hydrateIcons populates innerHTML of elements with data-icon attribute', () => {
    const mockElements = [
      {
        dataset: { icon: 'select', iconSize: '24' },
        innerHTML: ''
      },
      {
        dataset: { icon: 'undo', iconSize: '20', iconFlip: 'true' },
        innerHTML: ''
      }
    ];

    const mockRoot = {
      querySelectorAll: (selector) => {
        if (selector === '[data-icon]') return mockElements;
        return [];
      }
    };

    hydrateIcons(mockRoot);

    assert.ok(mockElements[0].innerHTML.includes('<svg'));
    assert.ok(mockElements[0].innerHTML.includes('width="24"'));
    assert.ok(mockElements[1].innerHTML.includes('<svg'));
    assert.ok(mockElements[1].innerHTML.includes('width="20"'));
    assert.ok(mockElements[1].innerHTML.includes('transform:scaleX(-1)'));
  });
});
