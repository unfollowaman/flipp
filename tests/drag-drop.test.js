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
    activatePill,
    setProgress,
    initDropZone,
    fileToDataUrl,
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

  class FileReader {
    readAsDataURL(file) {
      if (file && file.shouldError) {
        if (typeof this.onerror === 'function') {
          this.onerror(new Error('Failed to read file'));
        }
      } else {
        if (typeof this.onload === 'function') {
          this.onload({ target: { result: 'data:image/png;base64,mockdata' } });
        }
      }
    }
  }

  const window = {
    getComputedStyle: () => ({ display: 'block' }),
  };

  const document = {
    addEventListener: () => {},
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
          child.parentElement = this;
          this.children.push(child);
        },
        remove: function() {
          this.removed = true;
          if (this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter(e => e !== this);
          }
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

const { showToast, activatePill, setProgress, initDropZone, fileToDataUrl, getDOMState, resetDOM } = new Function(evaluateCode)();

test('setProgress', async (t) => {
  await t.test('updates progress bar width and label text', () => {
    const barEl = { style: { width: '' } };
    const labelEl = { textContent: '' };

    setProgress(barEl, labelEl, 45, 'Processing...');

    assert.strictEqual(barEl.style.width, '45%');
    assert.strictEqual(labelEl.textContent, 'Processing...');
  });

  await t.test('handles omitted label element gracefully', () => {
    const barEl = { style: { width: '' } };

    // Should not throw when labelEl is null
    setProgress(barEl, null, 100, 'Done');

    assert.strictEqual(barEl.style.width, '100%');
  });

  await t.test('handles 0 correctly', () => {
    const barEl = { style: { width: '' } };
    const labelEl = { textContent: '' };

    setProgress(barEl, labelEl, 0, 'Start');

    assert.strictEqual(barEl.style.width, '0%');
    assert.strictEqual(labelEl.textContent, 'Start');
  });

  await t.test('handles 100 correctly', () => {
    const barEl = { style: { width: '' } };
    const labelEl = { textContent: '' };

    setProgress(barEl, labelEl, 100, 'Complete');

    assert.strictEqual(barEl.style.width, '100%');
    assert.strictEqual(labelEl.textContent, 'Complete');
  });

  await t.test('throws TypeError if barEl is null', () => {
    assert.throws(() => {
      setProgress(null, null, 50, 'Loading...');
    }, TypeError);
  });

  await t.test('throws TypeError if barEl lacks style property', () => {
    assert.throws(() => {
      setProgress({}, null, 50, 'Loading...');
    }, TypeError);
  });
});

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
    assert.strictEqual(container.children.length, 0);
  });
});

test('activatePill', async (t) => {
  await t.test('activates only the pill matching the value', () => {
    const createPill = (value, isActive = false) => {
      let hasActive = isActive;
      return {
        dataset: { value },
        classList: {
          toggle: (cls, force) => {
            if (cls === 'active') {
              hasActive = force;
            }
          },
          contains: (cls) => cls === 'active' ? hasActive : false
        },
        isActive: () => hasActive
      };
    };

    const pillA = createPill('a', false);
    const pillB = createPill('b', true);
    const pillC = createPill('c', false);

    const group = {
      querySelectorAll: (selector) => {
        if (selector === '.opt-pill') {
          return [pillA, pillB, pillC];
        }
        return [];
      }
    };

    activatePill(group, 'a');

    assert.strictEqual(pillA.isActive(), true);
    assert.strictEqual(pillB.isActive(), false);
    assert.strictEqual(pillC.isActive(), false);
  });

  await t.test('deactivates all pills if no value matches', () => {
    const createPill = (value, isActive = false) => {
      let hasActive = isActive;
      return {
        dataset: { value },
        classList: {
          toggle: (cls, force) => {
            if (cls === 'active') {
              hasActive = force;
            }
          },
          contains: (cls) => cls === 'active' ? hasActive : false
        },
        isActive: () => hasActive
      };
    };

    const pillA = createPill('a', true);
    const pillB = createPill('b', true);

    const group = {
      querySelectorAll: (selector) => {
        if (selector === '.opt-pill') {
          return [pillA, pillB];
        }
        return [];
      }
    };

    activatePill(group, 'c');

    assert.strictEqual(pillA.isActive(), false);
    assert.strictEqual(pillB.isActive(), false);
  });

  await t.test('handles empty group gracefully', () => {
    const group = {
      querySelectorAll: () => []
    };

    // Should not throw
    activatePill(group, 'a');
    assert.ok(true);
  });
});


test('initDropZone', async (t) => {
  const createMockElement = (classes = []) => {
    const listeners = {};
    const classSet = new Set(classes);
    return {
      listeners,
      addEventListener: (evt, cb) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(cb);
      },
      dispatchEvent: (evtName, eObj = {}) => {
        if (listeners[evtName]) {
          listeners[evtName].forEach(cb => cb(eObj));
        }
      },
      classList: {
        contains: (cls) => classSet.has(cls),
        add: (cls) => classSet.add(cls),
        remove: (cls) => classSet.delete(cls)
      },
      contains: () => false,
      style: { display: 'none' },
      click: function() { this.clicked = true; },
      value: '',
      clicked: false,
      className: classes.join(' ')
    };
  };

  await t.test('click on drop zone triggers file input click', () => {
    const dropZone = createMockElement();
    const fileInput = createMockElement();
    let onFilesCalled = false;

    initDropZone(dropZone, fileInput, () => { onFilesCalled = true; });

    dropZone.dispatchEvent('click', { target: { classList: { contains: () => false } } });

    assert.strictEqual(fileInput.clicked, true);
    assert.strictEqual(onFilesCalled, false);
  });

  await t.test('click on drop zone ignores clicks on .dz-browse-btn', () => {
    const dropZone = createMockElement();
    const fileInput = createMockElement();

    initDropZone(dropZone, fileInput, () => {});

    dropZone.dispatchEvent('click', { target: { classList: { contains: (cls) => cls === 'dz-browse-btn' } } });

    assert.strictEqual(fileInput.clicked, false);
  });

  await t.test('file input change triggers onFiles and resets value', () => {
    const dropZone = createMockElement();
    const fileInput = createMockElement();

    let receivedFiles = null;
    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    fileInput.dispatchEvent('change', {
      target: {
        files: ['file1.txt', 'file2.txt'],
        value: 'non-empty'
      }
    });

    assert.deepStrictEqual(receivedFiles, ['file1.txt', 'file2.txt']);
    assert.strictEqual(fileInput.value, '');
  });

  await t.test('dragover adds .drag-over class and prevents default', () => {
    const dropZone = createMockElement();
    const fileInput = createMockElement();
    let preventDefaultCalled = false;

    initDropZone(dropZone, fileInput, () => {});

    dropZone.dispatchEvent('dragover', {
      preventDefault: () => { preventDefaultCalled = true; }
    });

    assert.strictEqual(preventDefaultCalled, true);
    assert.strictEqual(dropZone.classList.contains('drag-over'), true);
  });

  await t.test('dragleave removes .drag-over class', () => {
    const dropZone = createMockElement(['drag-over']);
    const fileInput = createMockElement();

    initDropZone(dropZone, fileInput, () => {});

    dropZone.dispatchEvent('dragleave', { relatedTarget: null });

    assert.strictEqual(dropZone.classList.contains('drag-over'), false);
  });

  await t.test('drop removes .drag-over class, prevents default, and calls onFiles', () => {
    const dropZone = createMockElement(['drag-over']);
    const fileInput = createMockElement();
    let preventDefaultCalled = false;
    let receivedFiles = null;

    initDropZone(dropZone, fileInput, (files) => { receivedFiles = files; });

    const mockFiles = Object.assign([{name: 'file3.pdf'}], {
      [Symbol.iterator]: function() {
        let i = 0;
        return {
          next: () => {
            const res = { value: this[i], done: i >= this.length };
            i++;
            return res;
          }
        };
      }
    });

    dropZone.dispatchEvent('drop', {
      preventDefault: () => { preventDefaultCalled = true; },
      dataTransfer: { files: mockFiles }
    });

    assert.strictEqual(preventDefaultCalled, true);
    assert.strictEqual(dropZone.classList.contains('drag-over'), false);
    assert.deepStrictEqual(receivedFiles, [{name: 'file3.pdf'}]);
  });
});

test('fileToDataUrl', async (t) => {
  await t.test('resolves with data URL on successful read', async () => {
    const mockFile = { name: 'test.png', type: 'image/png' };
    const result = await fileToDataUrl(mockFile);
    assert.strictEqual(result, 'data:image/png;base64,mockdata');
  });

  await t.test('rejects with error when file read fails', async () => {
    const mockFile = { name: 'error.png', shouldError: true };
    await assert.rejects(
      async () => {
        await fileToDataUrl(mockFile);
      },
      { message: 'Failed to read file' }
    );
  });
});
