const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/scroll-reveal.js');
const src = fs.readFileSync(srcPath, 'utf8');

function createMockElement(id = '') {
  const classes = new Set();
  return {
    id,
    classList: {
      add(cls) {
        classes.add(cls);
      },
      contains(cls) {
        return classes.has(cls);
      }
    }
  };
}

function setupMockEnvironment(elements = []) {
  let domContentLoadedListener = null;
  let observerCallback = null;
  let observerOptions = null;
  const observedElements = [];
  const unobservedElements = [];

  class MockIntersectionObserver {
    constructor(callback, options) {
      observerCallback = callback;
      observerOptions = options;
    }
    observe(target) {
      observedElements.push(target);
    }
    unobserve(target) {
      unobservedElements.push(target);
    }
  }

  const mockDocument = {
    addEventListener(event, listener) {
      if (event === 'DOMContentLoaded') {
        domContentLoadedListener = listener;
      }
    },
    querySelectorAll(selector) {
      if (selector === '.reveal-on-scroll') {
        return elements;
      }
      return [];
    }
  };

  return {
    mockDocument,
    MockIntersectionObserver,
    triggerDOMContentLoaded() {
      if (domContentLoadedListener) {
        domContentLoadedListener();
      }
    },
    triggerIntersection(entries) {
      if (observerCallback) {
        const mockObserverInstance = {
          unobserve(target) {
            unobservedElements.push(target);
          }
        };
        observerCallback(entries, mockObserverInstance);
      }
    },
    getObservedElements() {
      return observedElements;
    },
    getUnobservedElements() {
      return unobservedElements;
    },
    getObserverOptions() {
      return observerOptions;
    }
  };
}

test('scroll-reveal registers DOMContentLoaded event listener and observes elements with threshold 0.1', () => {
  const el1 = createMockElement('el1');
  const el2 = createMockElement('el2');
  const env = setupMockEnvironment([el1, el2]);

  const fn = new Function('document', 'IntersectionObserver', src);
  fn(env.mockDocument, env.MockIntersectionObserver);

  // Before DOMContentLoaded, nothing observed
  assert.strictEqual(env.getObservedElements().length, 0);

  // Trigger DOMContentLoaded
  env.triggerDOMContentLoaded();

  assert.strictEqual(env.getObservedElements().length, 2);
  assert.strictEqual(env.getObservedElements()[0], el1);
  assert.strictEqual(env.getObservedElements()[1], el2);
  assert.deepStrictEqual(env.getObserverOptions(), { threshold: 0.1 });
});

test('scroll-reveal adds is-revealed class and unobserves target when entry is intersecting', () => {
  const el1 = createMockElement('el1');
  const env = setupMockEnvironment([el1]);

  const fn = new Function('document', 'IntersectionObserver', src);
  fn(env.mockDocument, env.MockIntersectionObserver);

  env.triggerDOMContentLoaded();

  assert.strictEqual(el1.classList.contains('is-revealed'), false);

  env.triggerIntersection([
    { isIntersecting: true, target: el1 }
  ]);

  assert.strictEqual(el1.classList.contains('is-revealed'), true);
  assert.strictEqual(env.getUnobservedElements().length, 1);
  assert.strictEqual(env.getUnobservedElements()[0], el1);
});

test('scroll-reveal ignores entries that are not intersecting', () => {
  const el1 = createMockElement('el1');
  const env = setupMockEnvironment([el1]);

  const fn = new Function('document', 'IntersectionObserver', src);
  fn(env.mockDocument, env.MockIntersectionObserver);

  env.triggerDOMContentLoaded();

  env.triggerIntersection([
    { isIntersecting: false, target: el1 }
  ]);

  assert.strictEqual(el1.classList.contains('is-revealed'), false);
  assert.strictEqual(env.getUnobservedElements().length, 0);
});

test('scroll-reveal handles empty element list without error', () => {
  const env = setupMockEnvironment([]);

  const fn = new Function('document', 'IntersectionObserver', src);
  fn(env.mockDocument, env.MockIntersectionObserver);

  assert.doesNotThrow(() => {
    env.triggerDOMContentLoaded();
  });

  assert.strictEqual(env.getObservedElements().length, 0);
});
