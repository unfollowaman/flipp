const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, '../js/header-nav.js');
const src = fs.readFileSync(srcPath, 'utf8');

const evaluateCode = `
  ${src}
  return {
    PDF_TOOLS,
    getCurrentToolId,
    getHeaderTools,
    getRootPrefix,
    renderHeaderToolsNav
  };
`;

function createMockDOM(opts = {}) {
  const elements = new Map();

  function getMockElement(tag, id = '', className = '') {
    const attrs = new Map();
    const children = [];
    let innerHTMLVal = '';

    const el = {
      tagName: tag.toUpperCase(),
      id,
      className,
      children,
      getAttribute(name) {
        return attrs.get(name) || null;
      },
      setAttribute(name, val) {
        attrs.set(name, val);
      },
      querySelector(sel) {
        if (sel === '.nav-end') return elements.get('nav-end') || null;
        if (sel === 'a.logo') return elements.get('logo') || null;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '.header-tool-shortcut') {
          const links = [];
          const regex = /<a href="([^"]+)" class="header-tool-shortcut">([^<]+)<\/a>/g;
          let match;
          while ((match = regex.exec(innerHTMLVal)) !== null) {
            links.push({ href: match[1], textContent: match[2] });
          }
          return links;
        }
        return [];
      },
      insertBefore(newChild, refChild) {
        const idx = children.indexOf(refChild);
        if (idx >= 0) children.splice(idx, 0, newChild);
        else children.push(newChild);
        return newChild;
      },
      appendChild(child) {
        children.push(child);
        return child;
      }
    };

    Object.defineProperty(el, 'innerHTML', {
      get() { return innerHTMLVal; },
      set(val) { innerHTMLVal = val; }
    });

    return el;
  }

  const logoEl = getMockElement('a', 'logo-id', 'logo');
  logoEl.setAttribute('href', opts.logoHref || '../../');
  elements.set('logo', logoEl);

  const navEndEl = getMockElement('div', 'nav-end-id', 'nav-end');
  elements.set('nav-end', navEndEl);

  const navbarEl = getMockElement('nav', 'navbar-id', 'navbar');
  navbarEl.children.push(logoEl, navEndEl);
  elements.set('navbar', navbarEl);

  const mockDocument = {
    readyState: 'complete',
    querySelector(sel) {
      if (sel === '.navbar') return elements.get('navbar');
      if (sel === 'a.logo') return elements.get('logo');
      return null;
    },
    getElementById(id) {
      if (id === 'header-tools-nav') return elements.get('header-tools-nav') || null;
      return null;
    },
    createElement(tag) {
      const el = getMockElement(tag);
      if (tag === 'div') {
        elements.set('header-tools-nav', el);
      }
      return el;
    },
    addEventListener() {}
  };

  const mockWindow = {
    location: {
      pathname: opts.pathname || '/tools/merge-pdf/'
    }
  };

  return { mockDocument, mockWindow, elements };
}

test('PDF_TOOLS metadata contains 15 PDF tools with concise labels', () => {
  const fn = new Function(evaluateCode);
  const { PDF_TOOLS } = fn();

  assert.strictEqual(PDF_TOOLS.length, 15);
  assert.strictEqual(PDF_TOOLS.find(t => t.id === 'merge-pdf').label, 'Merge');
  assert.strictEqual(PDF_TOOLS.find(t => t.id === 'split-pdf').label, 'Split');
  assert.strictEqual(PDF_TOOLS.find(t => t.id === 'compress-pdf').label, 'Compress');
  assert.strictEqual(PDF_TOOLS.find(t => t.id === 'pdf-to-png').label, 'PDF to PNG');
  assert.strictEqual(PDF_TOOLS.find(t => t.id === 'sign-pdf').label, 'Sign');
});

test('getCurrentToolId identifies current tool from pathname and handles non-tool pages', () => {
  const fn = new Function(evaluateCode);
  const { getCurrentToolId } = fn();

  assert.strictEqual(getCurrentToolId('/tools/merge-pdf/'), 'merge-pdf');
  assert.strictEqual(getCurrentToolId('/tools/compress-pdf/index.html'), 'compress-pdf');
  assert.strictEqual(getCurrentToolId('/tools/sign-pdf/'), 'sign-pdf');
  assert.strictEqual(getCurrentToolId('/tools/pdf-to-png/'), 'pdf-to-png');
  assert.strictEqual(getCurrentToolId('/'), null);
  assert.strictEqual(getCurrentToolId('/blog/'), null);
});

test('getHeaderTools excludes current page tool and selects top 6 remaining tools', () => {
  const fn = new Function(evaluateCode);
  const { getHeaderTools } = fn();

  const mergeTools = getHeaderTools('/tools/merge-pdf/');
  assert.strictEqual(mergeTools.length, 6);
  assert.strictEqual(mergeTools.some(t => t.id === 'merge-pdf'), false);
  assert.strictEqual(mergeTools[0].id, 'split-pdf');
  assert.strictEqual(mergeTools[1].id, 'compress-pdf');

  const compressTools = getHeaderTools('/tools/compress-pdf/');
  assert.strictEqual(compressTools.length, 6);
  assert.strictEqual(compressTools.some(t => t.id === 'compress-pdf'), false);
  assert.strictEqual(compressTools[0].id, 'merge-pdf');
  assert.strictEqual(compressTools[1].id, 'split-pdf');

  const homeTools = getHeaderTools('/');
  assert.strictEqual(homeTools.length, 6);
  assert.strictEqual(homeTools[0].id, 'merge-pdf');
  assert.strictEqual(homeTools[1].id, 'split-pdf');
});

test('renderHeaderToolsNav creates container and renders 6 shortcuts into DOM', () => {
  const { mockDocument, mockWindow, elements } = createMockDOM({
    logoHref: '../../',
    pathname: '/tools/merge-pdf/'
  });

  const fn = new Function('document', 'window', evaluateCode);
  const { renderHeaderToolsNav } = fn(mockDocument, mockWindow);

  renderHeaderToolsNav();

  const container = elements.get('header-tools-nav');
  assert.notStrictEqual(container, null);
  assert.strictEqual(container.id, 'header-tools-nav');
  assert.strictEqual(container.className, 'header-tools-nav');

  const links = container.querySelectorAll('.header-tool-shortcut');
  assert.strictEqual(links.length, 6);

  assert.strictEqual(links.some(l => l.textContent === 'Merge'), false);
  assert.strictEqual(links[0].textContent, 'Split');
  assert.strictEqual(links[0].href, '../../tools/split-pdf/');
  assert.strictEqual(links[1].textContent, 'Compress');
  assert.strictEqual(links[1].href, '../../tools/compress-pdf/');
});
