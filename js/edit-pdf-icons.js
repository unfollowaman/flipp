export const ICON_PATHS = {
  select: '<path d="M5 3v16l4.5-4.5L13 21l2.5-1.2-3.5-6.3h6.5z"/>',
  text: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
  mark: '<path d="M15 4l5 5-9 9H6v-5z"/><path d="M4 21h9"/>',
  draw: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  shape: '<path d="M4 4h11v11H4z"/><circle cx="16" cy="16" r="4.5"/>',
  box: '<path d="M4 6h16v12H4z"/>',
  image: '<path d="M4 5h16v14H4z"/><path d="M4 16l5-5 4 4 3-3 4 4"/><circle cx="9" cy="9.5" r="1.5"/>',
  pin: '<path d="M8 4h8l-1 6 3 3H6l3-3z"/><path d="M12 13v8"/>',
  watermark: '<path d="M12 2v6"/><path d="M6 8h12a2 2 0 0 1 2 2v4H4v-4a2 2 0 0 1 2-2z"/><path d="M3 18h18v3H3z"/>',
  undo: '<path d="M9 4L4 9l5 5"/><path d="M4 9h10a5 5 0 010 10H9"/>',
  edit: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  pages: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  docText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h5"/>',
  annotate: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  filePlus: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  rotate: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  layerFront: '<path d="M12 4l6 6H6l6-6z"/><path d="M5 16h14M5 20h14"/>',
  layerForward: '<path d="M12 5l6 6H6l6-6z"/><path d="M5 17h14"/>',
  layerBackward: '<path d="M5 7h14"/><path d="M12 19l-6-6h12l-6 6z"/>',
  layerBack: '<path d="M5 4h14M5 8h14"/><path d="M12 20l-6-6h12l-6 6z"/>'
};

export function icon(name, size = 24, flip = false, strokeWidth = 2) {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"' + (flip ? ' style="transform:scaleX(-1)"' : '') + '>' + paths + '</svg>';
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const size = Number(el.dataset.iconSize) || 24;
    const flip = el.dataset.iconFlip === 'true';
    el.innerHTML = icon(el.dataset.icon, size, flip);
  });
}
