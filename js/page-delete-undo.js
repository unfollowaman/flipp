/**
 * Premium Page Deletion Animation and Undo History Manager
 * Flipp Privacy-First PDF Toolkit
 */

function isReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Creates an ARIA live region for screen reader announcements if one doesn't exist.
 */
function getOrCreateLiveRegion() {
  if (typeof document === "undefined") return null;
  let liveRegion = document.getElementById("flipp-live-region");
  if (!liveRegion) {
    liveRegion = document.createElement("div");
    liveRegion.id = "flipp-live-region";
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    liveRegion.style.cssText =
      "position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); border: 0;";
    document.body.appendChild(liveRegion);
  }
  return liveRegion;
}

function announce(message) {
  const liveRegion = getOrCreateLiveRegion();
  if (liveRegion) {
    liveRegion.textContent = "";
    // Brief timeout to ensure screen reader registers the change
    setTimeout(() => {
      liveRegion.textContent = message;
    }, 50);
  }
}

/**
 * Run particle disintegration animation on a page card.
 * @param {HTMLElement} card - The thumbnail card DOM element.
 * @returns {Promise<void>} Resolves when animation completes and card can be removed.
 */
export async function animatePageDisintegration(card) {
  if (!card || !card.getBoundingClientRect) return;

  if (isReducedMotion()) {
    card.style.transition = "opacity 150ms ease, transform 150ms ease";
    card.style.opacity = "0";
    card.style.transform = "scale(0.9)";
    await new Promise((r) => setTimeout(r, 150));
    return;
  }

  const rect = card.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  // Create overlay canvas for particle animation
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.style.position = "absolute";
  canvas.style.left = `${card.offsetLeft}px`;
  canvas.style.top = `${card.offsetTop}px`;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "100";

  const parent = card.parentElement;
  if (parent) {
    parent.style.position = parent.style.position || "relative";
    parent.appendChild(canvas);
  }

  const ctx = canvas.getContext("2d");

  // Sample card background / image or use Candy Brutalism colors
  const colors = [
    "#ff70a6", // pink
    "#70d6ff", // sky-blue
    "#ff9770", // orange
    "#ffd670", // yellow
    "#e9ff70", // lime
    "#3a86ff", // blue
    "#000000", // dark detail
    "#ffffff", // paper white
  ];

  const NUM_PARTICLES = 45;
  const particles = [];

  for (let i = 0; i < NUM_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4.5;
    particles.push({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5, // slight upward float bias
      size: 2.5 + Math.random() * 4.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1.0,
      decay: 0.02 + Math.random() * 0.03,
    });
  }

  // Fade and scale down host card simultaneously
  card.style.transition = "transform 350ms ease, opacity 350ms ease, filter 350ms ease";
  card.style.transform = "scale(0.85) rotate(" + (Math.random() * 6 - 3) + "deg)";
  card.style.opacity = "0.2";
  card.style.filter = "blur(2px)";

  const startTime = Date.now();
  const DURATION = 400;

  await new Promise((resolve) => {
    function step() {
      const elapsed = Date.now() - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let activeParticles = 0;
      for (const p of particles) {
        if (p.alpha <= 0) continue;
        activeParticles++;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha = Math.max(0, p.alpha - p.decay);

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (elapsed < DURATION && activeParticles > 0) {
        requestAnimationFrame(step);
      } else {
        if (canvas.parentElement) {
          canvas.parentElement.removeChild(canvas);
        }
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

/**
 * Run restoration pop-in animation when a page card is undone.
 * @param {HTMLElement} card - The restored thumbnail card DOM element.
 */
export async function animatePageRestoration(card) {
  if (!card) return;

  if (isReducedMotion()) {
    card.style.transition = "none";
    card.style.opacity = "1";
    card.style.transform = "none";
    card.style.filter = "none";
    return;
  }

  card.style.transition = "none";
  card.style.transform = "scale(0.8)";
  card.style.opacity = "0";
  card.style.filter = "none";
  card.style.boxShadow = "0 0 0 4px var(--mint, #70d6ff)";

  // Force reflow
  void card.offsetWidth;

  card.style.transition = "transform 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 300ms ease, box-shadow 400ms ease";
  card.style.transform = "scale(1)";
  card.style.opacity = "1";

  setTimeout(() => {
    card.style.boxShadow = "";
  }, 450);
}

/**
 * Undo History Manager for Page Deletions
 */
export class PageDeleteUndoManager {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Grid element containing page cards.
   * @param {HTMLElement} options.undoBtn - Undo button element.
   * @param {Function} options.onUpdate - Callback executed after delete or undo to refresh state & page numbers.
   */
  constructor(options = {}) {
    this.container = options.container;
    this.undoBtn = options.undoBtn;
    this.onUpdate = options.onUpdate;
    this.history = [];
    this.hasEverDeleted = false;
    this.isProcessing = false;

    if (this.undoBtn) {
      this.undoBtn.addEventListener("click", () => this.undo());
      this.updateUndoBtnUI();
    }
  }

  /**
   * Delete a page card with particle disintegration animation and record in undo history.
   * @param {HTMLElement} card - Target card element.
   * @param {string} [pageLabel] - Optional label (e.g. "Page 3") for screen reader announcements.
   */
  async deletePage(card, pageLabel = "") {
    if (!card || card.classList.contains("is-deleting")) return;

    card.classList.add("is-deleting");
    const rmBtn = card.querySelector(".img-thumb-remove");
    if (rmBtn) rmBtn.disabled = true;

    // Snapshot position before removing
    const allCards = Array.from(this.container.querySelectorAll(".img-thumb-card"));
    const index = allCards.indexOf(card);
    const nextSibling = card.nextElementSibling;

    // Record history item
    this.history.push({
      card,
      nextSibling,
      index,
      pageLabel: pageLabel || `Page ${index + 1}`,
    });
    this.hasEverDeleted = true;

    // Run disintegration animation
    await animatePageDisintegration(card);

    // Remove from DOM
    card.remove();
    card.classList.remove("is-deleting");
    card.style.opacity = "";
    card.style.transform = "";
    card.style.filter = "";
    if (rmBtn) rmBtn.disabled = false;

    // Update UI state and notify live region
    this.updateUndoBtnUI();
    if (typeof this.onUpdate === "function") {
      this.onUpdate();
    }
    announce(`${pageLabel || `Page ${index + 1}`} deleted.`);
  }

  /**
   * Undo the most recent page deletion.
   */
  async undo() {
    if (this.history.length === 0 || this.isProcessing) return;
    this.isProcessing = true;

    const entry = this.history.pop();
    const { card, nextSibling, index, pageLabel } = entry;

    // Determine insertion position in container
    if (nextSibling && this.container.contains(nextSibling)) {
      this.container.insertBefore(card, nextSibling);
    } else {
      const currentCards = Array.from(this.container.querySelectorAll(".img-thumb-card"));
      if (index < currentCards.length) {
        this.container.insertBefore(card, currentCards[index]);
      } else {
        this.container.appendChild(card);
      }
    }

    // Run restoration animation
    await animatePageRestoration(card);

    this.isProcessing = false;
    this.updateUndoBtnUI();

    if (typeof this.onUpdate === "function") {
      this.onUpdate();
    }
    announce(`${pageLabel} restored.`);
  }

  /**
   * Update the Undo button state (Hidden, Active, or Faded/Disabled).
   */
  updateUndoBtnUI() {
    if (!this.undoBtn) return;

    const count = this.history.length;

    if (!this.hasEverDeleted && count === 0) {
      // STATE A: Hidden
      this.undoBtn.style.display = "none";
      this.undoBtn.disabled = true;
      this.undoBtn.removeAttribute("aria-label");
    } else if (count > 0) {
      // STATE B: Active
      this.undoBtn.style.display = "inline-flex";
      this.undoBtn.disabled = false;
      this.undoBtn.style.opacity = "1";
      this.undoBtn.style.pointerEvents = "auto";
      this.undoBtn.removeAttribute("aria-disabled");
      this.undoBtn.setAttribute("aria-label", `Undo page deletion (${count} available)`);
      this.undoBtn.textContent = "↩ Undo Delete ";
      const badge = document.createElement("span");
      badge.className = "undo-count-badge";
      badge.style.marginLeft = "4px";
      badge.style.opacity = "0.85";
      badge.textContent = `(${count})`;
      this.undoBtn.appendChild(badge);
    } else {
      // STATE C: All deletions undone - visible but disabled/faded
      this.undoBtn.style.display = "inline-flex";
      this.undoBtn.disabled = true;
      this.undoBtn.style.opacity = "0.5";
      this.undoBtn.style.pointerEvents = "none";
      this.undoBtn.setAttribute("aria-disabled", "true");
      this.undoBtn.setAttribute("aria-label", "Undo delete (No deleted pages to restore)");
      this.undoBtn.textContent = "↩ Undo Delete";
    }
  }

  /**
   * Clear history (e.g., when resetting or uploading a new document).
   */
  reset() {
    this.history = [];
    this.hasEverDeleted = false;
    this.isProcessing = false;
    this.updateUndoBtnUI();
  }
}
