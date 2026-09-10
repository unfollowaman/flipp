const PDF_TOOLS = [
  { id: 'merge-pdf', label: 'Merge', path: 'tools/merge-pdf/' },
  { id: 'split-pdf', label: 'Split', path: 'tools/split-pdf/' },
  { id: 'compress-pdf', label: 'Compress', path: 'tools/compress-pdf/' },
  { id: 'pdf-to-png', label: 'PDF to PNG', path: 'tools/pdf-to-png/' },
  { id: 'images-to-pdf', label: 'Images to PDF', path: 'tools/images-to-pdf/' },
  { id: 'sign-pdf', label: 'Sign', path: 'tools/sign-pdf/' },
  { id: 'protect-pdf', label: 'Protect', path: 'tools/protect-pdf/' },
  { id: 'unlock-pdf', label: 'Unlock', path: 'tools/unlock-pdf/' },
  { id: 'pdf-to-word', label: 'PDF to Word', path: 'tools/pdf-to-word/' },
  { id: 'pdf-to-text', label: 'PDF to Text', path: 'tools/pdf-to-text/' },
  { id: 'add-watermark', label: 'Watermark', path: 'tools/add-watermark/' },
  { id: 'rearrange-pdf', label: 'Rearrange', path: 'tools/rearrange-pdf/' },
  { id: 'add-page-numbers', label: 'Page Numbers', path: 'tools/add-page-numbers/' },
  { id: 'edit-pdf', label: 'Edit PDF', path: 'tools/edit-pdf/' },
  { id: 'text-to-pdf', label: 'Text to PDF', path: 'tools/text-to-pdf/' }
];

function getCurrentToolId(currentPath = '') {
  if (!currentPath) return null;
  const tool = PDF_TOOLS.find(t =>
    currentPath.includes(`/tools/${t.id}/`) ||
    currentPath.includes(`/tools/${t.id}`) ||
    currentPath.includes(`tools/${t.id}/`) ||
    currentPath.includes(`tools/${t.id}`)
  );
  return tool ? tool.id : null;
}

function getHeaderTools(currentPath = '') {
  const currentId = getCurrentToolId(currentPath);
  return PDF_TOOLS.filter(t => t.id !== currentId).slice(0, 6);
}

function getRootPrefix() {
  if (typeof document === 'undefined') return './';
  const logo = document.querySelector('a.logo');
  if (logo && logo.getAttribute('href')) {
    let href = logo.getAttribute('href');
    if (href.endsWith('index.html')) {
      href = href.replace(/index\.html$/, '');
    }
    if (!href.endsWith('/')) {
      href += '/';
    }
    return href;
  }
  return './';
}

function renderHeaderToolsNav() {
  if (typeof document === 'undefined') return;
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  let container = document.getElementById('header-tools-nav');
  if (!container) {
    container = document.createElement('div');
    container.id = 'header-tools-nav';
    container.className = 'header-tools-nav';
    container.setAttribute('aria-label', 'PDF tool shortcuts');
    const navEnd = navbar.querySelector('.nav-end');
    if (navEnd) {
      navbar.insertBefore(container, navEnd);
    } else {
      navbar.appendChild(container);
    }
  }

  const currentPath = (typeof window !== 'undefined' && window.location)
    ? (window.location.pathname || window.location.href || '')
    : '';

  const rootPrefix = getRootPrefix();
  const toolsToShow = getHeaderTools(currentPath);

  container.innerHTML = toolsToShow.map(tool => {
    const href = rootPrefix + tool.path;
    return `<a href="${href}" class="header-tool-shortcut">${tool.label}</a>`;
  }).join('');
}

if (typeof window !== 'undefined') {
  window.FlippHeaderNav = {
    PDF_TOOLS,
    getCurrentToolId,
    getHeaderTools,
    getRootPrefix,
    renderHeaderToolsNav
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHeaderToolsNav);
  } else {
    renderHeaderToolsNav();
  }
}
