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

export function activatePill(group, value) {
  group.querySelectorAll('.opt-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === value);
  });
}


// ── Shared Drag Reorder Logic ──────────────────────────────
let dragSrcCard = null;
let initialTouchY = 0;
let initialTouchX = 0;
let lastTouchTarget = null;

export function setupDragReorder(card, onReorder) {
  // Mobile touch support
  card.addEventListener('touchstart', (e) => {
    if (e.target.closest('.img-thumb-remove')) return;
    const currentCard = e.target.closest('.img-thumb-card');
    if (!currentCard) return;
    dragSrcCard = currentCard;
    const touch = e.touches[0];
    initialTouchX = touch.clientX;
    initialTouchY = touch.clientY;

    currentCard.classList.add('dragging');
    currentCard.style.zIndex = '1000';
  }, {passive: false});

  card.addEventListener('touchmove', (e) => {
    if (!dragSrcCard) return;
    e.preventDefault();
    const touch = e.touches[0];

    const deltaX = touch.clientX - initialTouchX;
    const deltaY = touch.clientY - initialTouchY;
    dragSrcCard.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    dragSrcCard.style.visibility = 'hidden';
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    dragSrcCard.style.visibility = 'visible';

    const targetCard = target ? target.closest('.img-thumb-card') : null;

    if (targetCard && targetCard !== dragSrcCard) {
      if (lastTouchTarget && lastTouchTarget !== targetCard) {
        lastTouchTarget.classList.remove('drag-target');
      }
      targetCard.classList.add('drag-target');
      lastTouchTarget = targetCard;
    } else if (!targetCard && lastTouchTarget) {
      lastTouchTarget.classList.remove('drag-target');
      lastTouchTarget = null;
    }
  }, {passive: false});

  card.addEventListener('touchend', (e) => {
    if (!dragSrcCard) return;
    dragSrcCard.classList.remove('dragging');
    dragSrcCard.style.transform = '';
    dragSrcCard.style.zIndex = '';

    if (lastTouchTarget) {
      lastTouchTarget.classList.remove('drag-target');
      handleDrop(lastTouchTarget, onReorder);
    }

    dragSrcCard = null;
    lastTouchTarget = null;
  }, {passive: false});

  // Desktop drag support
  card.addEventListener('dragstart', (e) => {
    dragSrcCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    if (card.parentElement) {
      card.parentElement.querySelectorAll('.img-thumb-card').forEach(c => {
        c.classList.remove('drag-target');
      });
    }
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!card.classList.contains('drag-target')) {
      const active = card.parentElement ? card.parentElement.querySelector('.drag-target') : null;
      if (active) active.classList.remove('drag-target');
      card.classList.add('drag-target');
    }
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    handleDrop(card, onReorder);
  });
}

function handleDrop(targetCard, onReorder) {
  if (!dragSrcCard || dragSrcCard === targetCard) return;

  const parent = targetCard.parentElement;
  if (!parent) return;

  const allCards = Array.from(parent.querySelectorAll('.img-thumb-card'));
  const srcIndex = allCards.indexOf(dragSrcCard);
  const targetIndex = allCards.indexOf(targetCard);

  if (srcIndex < targetIndex) {
    targetCard.after(dragSrcCard);
  } else {
    targetCard.before(dragSrcCard);
  }

  if (onReorder) {
    onReorder();
  }
}
