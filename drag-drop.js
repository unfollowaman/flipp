// drag-drop.js — Shared drag/drop wiring for both drop zones

export function initDropZone(dropZoneEl, fileInputEl, onFiles) {
  // Click on drop zone
  dropZoneEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('dz-browse-btn')) return; // handled elsewhere
    fileInputEl.click();
  });

  // File input change
  fileInputEl.addEventListener('change', (e) => {
    if (e.target.files.length) onFiles(Array.from(e.target.files));
    // Reset so same file can be re-selected
    e.target.value = '';
  });

  // Drag events
  dropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZoneEl.classList.add('drag-over');
  });

  dropZoneEl.addEventListener('dragleave', (e) => {
    if (!dropZoneEl.contains(e.relatedTarget)) {
      dropZoneEl.classList.remove('drag-over');
    }
  });

  dropZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZoneEl.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  });
}

export function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

export function setProgress(barEl, labelEl, value, label) {
  barEl.style.width = `${value}%`;
  if (labelEl) labelEl.textContent = label;
}
