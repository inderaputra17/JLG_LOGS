// /js/nav.js
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav"); // optional (aria-controls)
  const topbarInner = document.querySelector(".topbar-inner");
  const navWrap = document.querySelector(".nav-wrap");

  // Guard: don’t crash pages
  if (!toggle || !topbarInner || !navWrap) return;

  function setOpen(open) {
    topbarInner.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));

    // Optional: ensure the controlled element exists for accessibility
    if (nav) nav.setAttribute("aria-hidden", String(!open));
  }

  // Start closed
  setOpen(false);

  toggle.addEventListener("click", () => {
    const isOpen = topbarInner.classList.contains("nav-open");
    setOpen(!isOpen);
  });

  // Close when clicking a nav link
  navWrap.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) setOpen(false);
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  // Close if user clicks outside nav when open (mobile)
  document.addEventListener("click", (e) => {
    if (!topbarInner.classList.contains("nav-open")) return;
    const clickedInside = topbarInner.contains(e.target);
    if (!clickedInside) setOpen(false);
  });
});
