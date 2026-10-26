(function () {
  'use strict';
  window.__cardRevealLoaded = true;

  var root = document.documentElement;
  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card, .blog-card'));
  if (!cards.length) return;

  var ANIMATED = '.tool-card-icon-wrapper, .tool-card-badge, .tool-card-title, .tool-card-desc, .tool-card-arrow, .blog-card-icon, .blog-card-badge, .blog-card-title, .blog-card-desc, .blog-card-arrow';

  function showInstantly(card) {
    card.classList.add('is-visible', 'is-settled');
  }

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !('IntersectionObserver' in window) || !root.classList.contains('card-reveal-ready')) {
    cards.forEach(showInstantly);
    return;
  }

  function watchSettle(card) {
    var animatedElements = Array.prototype.slice.call(card.querySelectorAll(ANIMATED)).filter(function (el) {
      return getComputedStyle(el).display !== 'none';
    });
    var expected = 1 + animatedElements.length;
    var finished = 0;
    card.addEventListener('animationend', function onEnd(e) {
      if (e.animationName !== 'card-unfold' && e.animationName !== 'card-el-unfold') return;
      finished++;
      if (finished >= expected) {
        card.removeEventListener('animationend', onEnd);
        card.classList.add('is-settled');
      }
    });
  }

  var observer = new IntersectionObserver(function (entries) {
    var visible = entries
      .filter(function (en) { return en.isIntersecting; })
      .sort(function (a, b) {
        return (a.boundingClientRect.top - b.boundingClientRect.top) ||
               (a.boundingClientRect.left - b.boundingClientRect.left);
      });
    visible.forEach(function (en, i) {
      var card = en.target;
      card.style.setProperty('--card-delay', (Math.min(i, 4) * 90) + 'ms');
      watchSettle(card);
      card.classList.add('is-visible');
      observer.unobserve(card);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  cards.forEach(function (card) { observer.observe(card); });
})();
