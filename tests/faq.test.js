const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/faq.js');
const src = fs.readFileSync(srcPath, 'utf8');

function createMockItem(opts = {}) {
  const classes = new Set(opts.initialClasses || []);

  let buttonListeners = [];
  const button = opts.hasButton !== false ? {
    id: opts.buttonId || '',
    attributes: new Map(),
    listeners: buttonListeners,
    setAttribute(name, val) {
      this.attributes.set(name, String(val));
    },
    getAttribute(name) {
      return this.attributes.get(name) || null;
    },
    addEventListener(event, fn) {
      if (event === 'click') {
        buttonListeners.push(fn);
      }
    },
    click() {
      buttonListeners.forEach(fn => fn());
    }
  } : null;

  const answer = opts.hasAnswer !== false ? {
    id: opts.answerId || ''
  } : null;

  const item = {
    classList: {
      toggle(cls) {
        if (classes.has(cls)) {
          classes.delete(cls);
          return false;
        } else {
          classes.add(cls);
          return true;
        }
      },
      contains(cls) {
        return classes.has(cls);
      }
    },
    querySelector(sel) {
      if (sel === '.tcs-faq-q') return button;
      if (sel === '.tcs-faq-a') return answer;
      return null;
    },
    button,
    answer
  };

  return item;
}

function createMockDocument(items = []) {
  let domContentLoadedHandler = null;
  return {
    addEventListener(event, fn) {
      if (event === 'DOMContentLoaded') {
        domContentLoadedHandler = fn;
      }
    },
    triggerDOMContentLoaded() {
      if (domContentLoadedHandler) {
        domContentLoadedHandler();
      }
    },
    querySelectorAll(sel) {
      if (sel === '.tcs-faq-item') {
        return items;
      }
      return [];
    }
  };
}

test('FAQ initialization sets aria-expanded to false on DOMContentLoaded', () => {
  const item1 = createMockItem();
  const item2 = createMockItem();
  const mockDocument = createMockDocument([item1, item2]);

  const fn = new Function('document', src);
  fn(mockDocument);

  // Trigger DOMContentLoaded
  mockDocument.triggerDOMContentLoaded();

  assert.strictEqual(item1.button.getAttribute('aria-expanded'), 'false');
  assert.strictEqual(item2.button.getAttribute('aria-expanded'), 'false');
});

test('FAQ initialization assigns IDs and sets aria-controls attribute', () => {
  const item1 = createMockItem();
  const item2 = createMockItem({ buttonId: 'custom-q-id', answerId: 'custom-a-id' });
  const mockDocument = createMockDocument([item1, item2]);

  const fn = new Function('document', src);
  fn(mockDocument);

  mockDocument.triggerDOMContentLoaded();

  assert.strictEqual(item1.button.id, 'faq-q-1');
  assert.strictEqual(item1.answer.id, 'faq-a-1');
  assert.strictEqual(item1.button.getAttribute('aria-controls'), 'faq-a-1');

  assert.strictEqual(item2.button.id, 'custom-q-id');
  assert.strictEqual(item2.answer.id, 'custom-a-id');
  assert.strictEqual(item2.button.getAttribute('aria-controls'), 'custom-a-id');
});

test('FAQ click handler toggles open class and updates aria-expanded', () => {
  const item = createMockItem();
  const mockDocument = createMockDocument([item]);

  const fn = new Function('document', src);
  fn(mockDocument);

  mockDocument.triggerDOMContentLoaded();

  assert.strictEqual(item.classList.contains('open'), false);
  assert.strictEqual(item.button.getAttribute('aria-expanded'), 'false');

  // First click: expand
  item.button.click();
  assert.strictEqual(item.classList.contains('open'), true);
  assert.strictEqual(item.button.getAttribute('aria-expanded'), 'true');

  // Second click: collapse
  item.button.click();
  assert.strictEqual(item.classList.contains('open'), false);
  assert.strictEqual(item.button.getAttribute('aria-expanded'), 'false');
});

test('FAQ handles missing button or answer element gracefully', () => {
  const itemMissingButton = createMockItem({ hasButton: false });
  const itemMissingAnswer = createMockItem({ hasAnswer: false });
  const itemValid = createMockItem();
  const mockDocument = createMockDocument([itemMissingButton, itemMissingAnswer, itemValid]);

  const fn = new Function('document', src);
  fn(mockDocument);

  // Should execute without throwing any errors
  assert.doesNotThrow(() => {
    mockDocument.triggerDOMContentLoaded();
  });

  // Valid item should still work
  assert.strictEqual(itemValid.button.getAttribute('aria-expanded'), 'false');
  itemValid.button.click();
  assert.strictEqual(itemValid.classList.contains('open'), true);
  assert.strictEqual(itemValid.button.getAttribute('aria-expanded'), 'true');
});

test('FAQ CSS contains neo-brutalist tactile shadows, badge indicators, and focus styling', () => {
  const cssPath = path.join(__dirname, '../css/styles.src.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify .tcs-faq tactile shadow
  assert.ok(css.includes('.tcs-faq {') || css.includes('.tcs-faq{'), '.tcs-faq rule should exist');
  assert.ok(css.includes('box-shadow: 4px 4px 0 var(--black);'), '.tcs-faq should have tactile 4px offset shadow');

  // Verify .tcs-faq-q focus-visible
  assert.ok(css.includes('.tcs-faq-q:focus-visible'), '.tcs-faq-q:focus-visible rule should exist');
  assert.ok(css.includes('outline: 3px solid var(--black);'), '.tcs-faq-q should have visible 3px focus outline');

  // Verify .tcs-faq-q::after tactile badge indicator
  assert.ok(css.includes('.tcs-faq-q::after'), '.tcs-faq-q::after rule should exist');
  assert.ok(css.includes('border: 1.5px solid var(--black);'), 'toggle badge should have 1.5px black border');
  assert.ok(css.includes('background: var(--yellow);'), 'toggle badge should have yellow background in collapsed state');
  assert.ok(css.includes('background: var(--pink);'), 'toggle badge should have pink background in open state');

  // Verify open item styling
  assert.ok(css.includes('.tcs-faq-item.open'), '.tcs-faq-item.open rule should exist');
  assert.ok(css.includes('border-top-color: var(--black);'), 'open answer section should have solid black top divider');
});
