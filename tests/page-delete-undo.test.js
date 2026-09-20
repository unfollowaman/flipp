const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/page-delete-undo.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Strip ES module imports/exports
src = src.replace(/export\s+(async\s+)?(function|class)/g, '$1$2');

src += '\nreturn { PageDeleteUndoManager, animatePageDisintegration, animatePageRestoration };\n';

test('PageDeleteUndoManager Unit Tests', async (t) => {
  const elementMap = {};

  const createMockElement = (id = '', tagName = 'div') => {
    const children = [];
    const eventListeners = {};
    const attributes = {};
    let innerHTMLVal = '';

    const el = {
      id,
      tagName: tagName.toUpperCase(),
      parentElement: null,
      nextElementSibling: null,
      style: { display: '', opacity: '', transform: '', filter: '', pointerEvents: '' },
      dataset: {},
      children,
      classList: {
        add: (cls) => { el.classList._classes.add(cls); },
        remove: (cls) => { el.classList._classes.delete(cls); },
        contains: (cls) => el.classList._classes.has(cls),
        _classes: new Set()
      },
      appendChild: (child) => {
        if (child) {
          const idx = children.indexOf(child);
          if (idx !== -1) children.splice(idx, 1);
          children.push(child);
          child.parentElement = el;
          updateSiblings();
        }
      },
      insertBefore: (newChild, refChild) => {
        if (!refChild) return el.appendChild(newChild);
        const refIdx = children.indexOf(refChild);
        if (refIdx !== -1) {
          const oldIdx = children.indexOf(newChild);
          if (oldIdx !== -1) children.splice(oldIdx, 1);
          const insertIdx = children.indexOf(refChild);
          children.splice(insertIdx, 0, newChild);
          newChild.parentElement = el;
          updateSiblings();
        } else {
          el.appendChild(newChild);
        }
      },
      removeChild: (child) => {
        const idx = children.indexOf(child);
        if (idx !== -1) {
          children.splice(idx, 1);
          child.parentElement = null;
          updateSiblings();
        }
      },
      remove: () => {
        if (el.parentElement) {
          el.parentElement.removeChild(el);
        }
      },
      textContent: '',
      addEventListener: (event, handler) => {
        eventListeners[event] = handler;
      },
      querySelector: (selector) => {
        if (selector === '.img-thumb-remove') return children.find(c => c.className === 'img-thumb-remove') || createMockElement('', 'button');
        return null;
      },
      querySelectorAll: (selector) => {
        if (selector === '.img-thumb-card') return children.filter(c => c.className && el.classList.contains && c.classList.contains('img-thumb-card'));
        return [];
      },
      contains: (node) => {
        let curr = node;
        while (curr) {
          if (curr === el) return true;
          curr = curr.parentElement;
        }
        return false;
      },
      click: () => {
        if (eventListeners['click']) eventListeners['click']({ stopPropagation: () => {} });
      },
      getAttribute: (name) => attributes[name] || null,
      setAttribute: (name, val) => { attributes[name] = val; },
      removeAttribute: (name) => { delete attributes[name]; },
      getBoundingClientRect: () => ({ width: 100, height: 120, top: 0, left: 0 })
    };

    function updateSiblings() {
      for (let i = 0; i < children.length; i++) {
        children[i].nextElementSibling = children[i + 1] || null;
      }
    }

    Object.defineProperty(el, 'innerHTML', {
      get: () => innerHTMLVal,
      set: (val) => {
        innerHTMLVal = val;
      }
    });

    return el;
  };

  const mockDocument = {
    getElementById: (id) => {
      if (!elementMap[id]) elementMap[id] = createMockElement(id);
      return elementMap[id];
    },
    createElement: (tag) => createMockElement('', tag),
    body: createMockElement('body')
  };

  const mockWindow = {
    matchMedia: (query) => ({ matches: true }) // reduced motion for fast test execution
  };

  const wrapper = new Function('document', 'window', 'requestAnimationFrame', 'setTimeout', src);

  let PageDeleteUndoManager;

  t.beforeEach(() => {
    for (const k in elementMap) delete elementMap[k];
    const exportsObj = wrapper(mockDocument, mockWindow, (cb) => cb(), (cb, delay) => cb());
    PageDeleteUndoManager = exportsObj.PageDeleteUndoManager;
  });

  await t.test('initial state: Undo button is hidden when no deletion has occurred', async () => {
    const container = createMockElement('grid');
    const undoBtn = createMockElement('undo-btn', 'button');

    const manager = new PageDeleteUndoManager({ container, undoBtn });

    assert.strictEqual(undoBtn.style.display, 'none');
    assert.strictEqual(undoBtn.disabled, true);
    assert.strictEqual(manager.history.length, 0);
  });

  await t.test('deleting one page updates history, DOM, and changes Undo button to active state', async () => {
    const container = createMockElement('grid');
    const undoBtn = createMockElement('undo-btn', 'button');

    const card1 = createMockElement('card1');
    card1.classList.add('img-thumb-card');
    const card2 = createMockElement('card2');
    card2.classList.add('img-thumb-card');

    container.appendChild(card1);
    container.appendChild(card2);

    let updated = false;
    const manager = new PageDeleteUndoManager({
      container,
      undoBtn,
      onUpdate: () => { updated = true; }
    });

    await manager.deletePage(card1, 'Page 1');

    assert.strictEqual(container.children.length, 1);
    assert.strictEqual(container.children[0], card2);
    assert.strictEqual(manager.history.length, 1);
    assert.strictEqual(updated, true);

    // Undo button active state
    assert.strictEqual(undoBtn.style.display, 'inline-flex');
    assert.strictEqual(undoBtn.disabled, false);
    assert.strictEqual(undoBtn.getAttribute('aria-label'), 'Undo page deletion (1 available)');
  });

  await t.test('undo restores deleted page to exact original position', async () => {
    const container = createMockElement('grid');
    const undoBtn = createMockElement('undo-btn', 'button');

    const card1 = createMockElement('card1');
    card1.classList.add('img-thumb-card');
    const card2 = createMockElement('card2');
    card2.classList.add('img-thumb-card');
    const card3 = createMockElement('card3');
    card3.classList.add('img-thumb-card');

    container.appendChild(card1);
    container.appendChild(card2);
    container.appendChild(card3);

    const manager = new PageDeleteUndoManager({ container, undoBtn });

    // Delete middle page (card2)
    await manager.deletePage(card2, 'Page 2');
    assert.deepStrictEqual(container.children, [card1, card3]);

    // Undo middle page deletion
    await manager.undo();
    assert.deepStrictEqual(container.children, [card1, card2, card3]);
  });

  await t.test('multiple deletions and full undo cycle transitions Undo button to disabled state', async () => {
    const container = createMockElement('grid');
    const undoBtn = createMockElement('undo-btn', 'button');

    const card1 = createMockElement('card1');
    card1.classList.add('img-thumb-card');
    const card2 = createMockElement('card2');
    card2.classList.add('img-thumb-card');

    container.appendChild(card1);
    container.appendChild(card2);

    const manager = new PageDeleteUndoManager({ container, undoBtn });

    await manager.deletePage(card1, 'Page 1');
    await manager.deletePage(card2, 'Page 2');
    assert.strictEqual(manager.history.length, 2);

    // Undo twice
    await manager.undo();
    assert.strictEqual(manager.history.length, 1);
    assert.strictEqual(undoBtn.disabled, false);

    await manager.undo();
    assert.strictEqual(manager.history.length, 0);

    // State C: All deletions undone - button remains visible but disabled/faded
    assert.strictEqual(undoBtn.style.display, 'inline-flex');
    assert.strictEqual(undoBtn.disabled, true);
    assert.strictEqual(undoBtn.getAttribute('aria-disabled'), 'true');
    assert.strictEqual(undoBtn.style.opacity, '0.5');

    // New deletion reactivates Undo
    await manager.deletePage(card1, 'Page 1');
    assert.strictEqual(undoBtn.disabled, false);
    assert.strictEqual(undoBtn.style.opacity, '1');
  });

  await t.test('reset clears history and hides Undo button', async () => {
    const container = createMockElement('grid');
    const undoBtn = createMockElement('undo-btn', 'button');
    const card1 = createMockElement('card1');
    card1.classList.add('img-thumb-card');
    container.appendChild(card1);

    const manager = new PageDeleteUndoManager({ container, undoBtn });

    await manager.deletePage(card1, 'Page 1');
    assert.strictEqual(manager.history.length, 1);

    manager.reset();
    assert.strictEqual(manager.history.length, 0);
    assert.strictEqual(undoBtn.style.display, 'none');
  });

  await t.test('updateUndoBtnUI uses safe DOM node creation without innerHTML', async () => {
    const container = createMockElement('grid');
    const undoBtn = createMockElement('undo-btn', 'button');

    const card1 = createMockElement('card1');
    card1.classList.add('img-thumb-card');
    container.appendChild(card1);

    const manager = new PageDeleteUndoManager({ container, undoBtn });

    await manager.deletePage(card1, 'Page 1');

    assert.strictEqual(undoBtn.textContent, '↩ Undo Delete ');
    assert.strictEqual(undoBtn.children.length, 1);
    const badge = undoBtn.children[0];
    assert.strictEqual(badge.className, 'undo-count-badge');
    assert.strictEqual(badge.textContent, '(1)');
  });
});
