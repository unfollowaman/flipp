document.addEventListener('DOMContentLoaded', () => {
  const faqItems = document.querySelectorAll('.tcs-faq-item');

  faqItems.forEach((item) => {
    const button = item.querySelector('.tcs-faq-q');
    const answer = item.querySelector('.tcs-faq-a');

    if (!button || !answer) return;

    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      const isOpen = item.classList.toggle('open');
      button.setAttribute('aria-expanded', String(isOpen));
    });
  });
});
