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
  edit: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>'
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
