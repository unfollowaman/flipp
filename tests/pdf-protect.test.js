const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/pdf-protect.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Robustly strip all import statements
src = src.replace(/import\s+.*?from\s+['"][^'"]+['"];?/gs, '');
// Strip export keywords
src = src.replace(/export\s+function/g, 'function');

src += '\nreturn { validatePasswords };\n';

const elementMap = {};

const mockDocument = {
  getElementById: (id) => {
    if (!elementMap[id]) {
      elementMap[id] = {
        addEventListener: () => {},
        style: {},
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        value: '',
        textContent: '',
        disabled: false
      };
    }
    return elementMap[id];
  },
  createElement: (tagName) => ({
    tagName,
    style: {},
    getContext: () => ({}),
    toDataURL: () => ''
  })
};

let toastMessages = [];
const mockShowToast = (msg, type) => {
  toastMessages.push({ msg, type });
};

const mockWindow = {};
const mockInitDropZone = () => {};

const wrapper = new Function('document', 'window', 'initDropZone', 'showToast', 'URL', src);

const { validatePasswords } = wrapper(
  mockDocument,
  mockWindow,
  mockInitDropZone,
  mockShowToast,
  { createObjectURL: () => '', revokeObjectURL: () => '' }
);

test('validatePasswords function', async (t) => {
  t.beforeEach(() => {
    toastMessages = [];
    elementMap['protect-password'].value = '';
    elementMap['protect-password-confirm'].value = '';
  });

  await t.test('returns null and shows toast if password is less than 8 characters', () => {
    elementMap['protect-password'].value = 'short';
    elementMap['protect-password-confirm'].value = 'short';

    const result = validatePasswords();

    assert.strictEqual(result, null);
    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Password must be at least 8 characters.');
    assert.strictEqual(toastMessages[0].type, 'error');
  });

  await t.test('returns null and shows toast if passwords do not match', () => {
    elementMap['protect-password'].value = 'password123';
    elementMap['protect-password-confirm'].value = 'password456';

    const result = validatePasswords();

    assert.strictEqual(result, null);
    assert.strictEqual(toastMessages.length, 1);
    assert.strictEqual(toastMessages[0].msg, 'Passwords do not match.');
    assert.strictEqual(toastMessages[0].type, 'error');
  });

  await t.test('returns password if valid and matches', () => {
    elementMap['protect-password'].value = 'password123';
    elementMap['protect-password-confirm'].value = 'password123';

    const result = validatePasswords();

    assert.strictEqual(result, 'password123');
    assert.strictEqual(toastMessages.length, 0);
  });

  await t.test('trims whitespace from passwords', () => {
    elementMap['protect-password'].value = '  password123  ';
    elementMap['protect-password-confirm'].value = '  password123  ';

    const result = validatePasswords();

    assert.strictEqual(result, 'password123');
    assert.strictEqual(toastMessages.length, 0);
  });
});
