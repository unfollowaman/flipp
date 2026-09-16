document.addEventListener("DOMContentLoaded", () => {
  const faqItems = document.querySelectorAll(".tcs-faq-item");

  faqItems.forEach((item, index) => {
    const button = item.querySelector(".tcs-faq-q");
    const answer = item.querySelector(".tcs-faq-a");

    if (!button || !answer) return;

    if (!button.id) {
      button.id = `faq-q-${index + 1}`;
    }
    if (!answer.id) {
      answer.id = `faq-a-${index + 1}`;
    }

    button.setAttribute("aria-controls", answer.id);
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", () => {
      const isOpen = item.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
    });
  });
});
