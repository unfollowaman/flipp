const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/drag-drop.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
src = src.replace(/export\s+function/g, 'function');
src = src.replace(/export\s+const/g, 'const');
src = src.replace(/export\s+let/g, 'let');

src += `
  return {
    showToast,
    getDOMState: () => ({ bodyChildren, allElements, timeouts }),
    resetDOM: () => {
      bodyChildren = [];
      allElements = [];
      timeouts = [];
    }
  };
`;

const evaluateCode = `
  let bodyChildren = [];
  let allElements = [];
  let timeouts = [];

  const window = {
    getComputedStyle: () => ({ display: 'block' }),
  };

  const document = {
    body: {
      appendChild: (el) => {
        bodyChildren.push(el);
      }
    },
    querySelector: (selector) => {
      if (selector === '.toast-container') {
        return bodyChildren.find(el => el.className === 'toast-container') || null;
      }
      return null;
    },
    createElement: (tag) => {
      const el = {
        tag,
        className: '',
        textContent: '',
        style: {},
        children: [],
        removed: false,
        appendChild: function(child) {
          this.children.push(child);
        },
        remove: function() {
          this.removed = true;
          if (bodyChildren.includes(this)) {
            bodyChildren = bodyChildren.filter(e => e !== this);
          }
        }
      };
      allElements.push(el);
      return el;
    }
  };

  const setTimeout = (cb, delay) => {
    timeouts.push({ cb, delay });
    return timeouts.length;
  };

  ${src}
`;

const { showToast, getDOMState, resetDOM } = new Function(evaluateCode)();

test('showToast', async (t) => {
  t.beforeEach(() => {
    resetDOM();
  });

  await t.test('creates toast container and success toast by default', () => {
    showToast('Task completed');

    const { bodyChildren, timeouts } = getDOMState();

    // Check container
    assert.strictEqual(bodyChildren.length, 1);
    const container = bodyChildren[0];
    assert.strictEqual(container.className, 'toast-container');
    assert.strictEqual(container.children.length, 1);

    // Check toast
    const toast = container.children[0];
    assert.strictEqual(toast.className, 'toast toast-success');
    assert.strictEqual(toast.textContent, 'Task completed');

    // Check timeout for fade out
    assert.strictEqual(timeouts.length, 1);
    assert.strictEqual(timeouts[0].delay, 3200);
  });

  await t.test('reuses existing toast container', () => {
    showToast('First');
    showToast('Second');

    const { bodyChildren } = getDOMState();

    assert.strictEqual(bodyChildren.length, 1);
    const container = bodyChildren[0];
    assert.strictEqual(container.className, 'toast-container');
    assert.strictEqual(container.children.length, 2);

    assert.strictEqual(container.children[0].textContent, 'First');
    assert.strictEqual(container.children[1].textContent, 'Second');
  });

  await t.test('creates toast with specific type', () => {
    showToast('Error occurred', 'error');

    const { bodyChildren } = getDOMState();
    const container = bodyChildren[0];
    const toast = container.children[0];

    assert.strictEqual(toast.className, 'toast toast-error');
    assert.strictEqual(toast.textContent, 'Error occurred');
  });

  await t.test('toast fade out and remove logic', () => {
    showToast('Fade test');

    const { bodyChildren, timeouts } = getDOMState();
    const container = bodyChildren[0];
    const toast = container.children[0];

    // Execute first timeout (fade out)
    timeouts[0].cb();

    assert.strictEqual(toast.style.opacity, '0');
    assert.strictEqual(toast.style.transform, 'translateY(8px)');
    assert.strictEqual(toast.style.transition, 'all 0.2s ease');

    // Fade out schedules remove timeout
    assert.strictEqual(timeouts.length, 2);
    assert.strictEqual(timeouts[1].delay, 200);

    // Execute second timeout (remove)
    timeouts[1].cb();
    assert.strictEqual(toast.removed, true);
  });
});
