// Draws the dotted trail that links release "stops" in the "You can just learn things" section.
// Without JS (or if anything fails) the CSS fallback draws a straight dotted line.
(function () {
  const SVG = "http://www.w3.org/2000/svg";

  function draw(trail) {
    const stops = Array.from(trail.querySelectorAll(".stop"));
    if (stops.length < 2) return;

    let svg = trail.querySelector(".trail__path");
    if (!svg) {
      svg = document.createElementNS(SVG, "svg");
      svg.setAttribute("class", "trail__path");
      svg.setAttribute("aria-hidden", "true");
      trail.prepend(svg);
    }
    svg.replaceChildren();

    const box = trail.getBoundingClientRect();
    const pts = stops.map((s) => {
      const r = s.querySelector(".stop__node").getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    });

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dy = b.y - a.y;
      // Vertical tangents at each node give a soft S-curve when the nodes are offset.
      const d = `M${a.x},${a.y} C${a.x},${a.y + dy * 0.5} ${b.x},${b.y - dy * 0.5} ${b.x},${b.y}`;
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", d);
      if (stops[i + 1].classList.contains("stop--upcoming")) path.classList.add("is-upcoming");
      svg.append(path);
    }

    // A short faint tail past the last stop: the trail keeps going.
    const last = pts[pts.length - 1];
    const tail = document.createElementNS(SVG, "path");
    tail.setAttribute("d", `M${last.x},${last.y} C${last.x},${last.y + 30} ${last.x + 20},${last.y + 40} ${last.x + 28},${last.y + 64}`);
    tail.classList.add("is-upcoming");
    svg.append(tail);

    trail.classList.add("is-drawn");
  }

  function init() {
    document.querySelectorAll(".trail").forEach((trail) => {
      const redraw = () => draw(trail);
      redraw();
      new ResizeObserver(redraw).observe(trail);
      if (document.fonts) document.fonts.ready.then(redraw);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
