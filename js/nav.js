// Top bar: highlights the section currently in view and adds a divider once the page scrolls.
// Clicking a link scrolls smoothly (CSS scroll-behavior); the landscape scrollbar follows
// automatically because it listens to the page's scroll position.
(function () {
  const bar = document.querySelector(".topbar");
  if (!bar) return;
  const links = Array.from(bar.querySelectorAll("a[data-section]"));
  const sections = links.map((a) => document.getElementById(a.dataset.section));

  function update() {
    bar.classList.toggle("is-scrolled", window.scrollY > 4);
    const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let current = 0;
    if (atBottom) current = sections.length - 1;
    else sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= window.innerHeight * 0.35) current = i; });
    links.forEach((a, i) => a.classList.toggle("is-active", i === current));
  }

  // "Home" goes to the very top rather than to the intro's offset.
  bar.querySelectorAll('a[href="#top"]').forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
})();
