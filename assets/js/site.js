// Shared page behavior: phone menu, publication filters, and videos that play only while on screen.
(function () {
  document.documentElement.classList.add("js");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // phone menu
  const nav = document.querySelector(".nav"), menu = nav && nav.querySelector(".menu");
  if (menu) menu.addEventListener("click", () => {
    const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    menu.setAttribute("aria-expanded", String(open));
  });

  // publication filters: each button names a data-tags value; "all" shows everything
  const filters = document.querySelectorAll("[data-filter]");
  filters.forEach(b => b.addEventListener("click", () => {
    filters.forEach(o => o.setAttribute("aria-pressed", String(o === b)));
    const f = b.dataset.filter;
    document.querySelectorAll(".pub").forEach(p => { p.hidden = f !== "all" && !p.dataset.tags.split(" ").includes(f); });
    document.querySelectorAll(".year").forEach(y => { y.hidden = !y.querySelector(".pub:not([hidden])"); });
    const n = document.querySelectorAll(".pub:not([hidden])").length;
    const out = document.getElementById("pub-count");
    if (out) out.textContent = `${n} ${n === 1 ? "paper" : "papers"} shown`;
  }));

  // timelines (publications, news): the rail fills orange down to 55% of the window (all of it at the page bottom),
  // lighting each year and paper it reaches; refreshed on scroll and whenever a filter changes the list's height
  const tl = document.querySelector("[data-timeline]");
  if (tl) {
    let queued = false;
    const update = () => {
      queued = false;
      const r = tl.getBoundingClientRect(), end = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      const fill = end ? r.height : Math.max(0, Math.min(r.height, innerHeight * .55 - r.top));
      tl.style.setProperty("--p", `${fill}px`);
      tl.querySelectorAll(tl.dataset.timeline).forEach(e => e.classList.toggle("lit", e.getBoundingClientRect().top - r.top + 14 <= fill));
    };
    const ask = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener("scroll", ask, { passive: true });
    new ResizeObserver(ask).observe(tl);
    update();
  }

  // news, wide screens: cards alternate sides of the rail, each starting at least STAGGER below the previous one
  // and below the last card on its own side, so the sides interlock; years sit below everything before them
  const list = document.querySelector(".news-list"), wide = window.matchMedia("(min-width: 861px)");
  const STAGGER = 110, GAP = 32;
  function pack() {
    if (!list) return;
    const lis = [...list.children].filter(li => !li.hidden);
    list.classList.toggle("packed", wide.matches);
    if (!wide.matches) {
      lis.forEach(li => { li.style.top = ""; delete li.dataset.side; });
      list.style.height = "";
      return;
    }
    let left = 0, right = 0, last = -Infinity, side = "left";
    for (const li of lis) {
      if (li.classList.contains("nyear")) {
        const top = Math.max(left, right);
        li.style.top = `${top}px`;
        left = right = top + li.offsetHeight + GAP;
        last = -Infinity; side = "left";
        continue;
      }
      li.dataset.side = side;
      const top = Math.max(side === "left" ? left : right, last + STAGGER);
      li.style.top = `${top}px`;
      last = top;
      if (side === "left") left = top + li.offsetHeight + GAP; else right = top + li.offsetHeight + GAP;
      side = side === "left" ? "right" : "left";
    }
    list.style.height = `${Math.max(left, right) - GAP}px`;
  }
  if (list) {
    pack();
    if (document.fonts) document.fonts.ready.then(pack);
    wide.addEventListener("change", pack);
    let w = list.clientWidth;
    new ResizeObserver(() => { if (list.clientWidth !== w) { w = list.clientWidth; pack(); } }).observe(list);
  }

  // news: cards slide in the first time they scroll into view; filter chips show one kind of item and hide
  // years left empty, animating the reflow with a view transition where the browser has one
  const items = document.querySelectorAll(".nitem");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -10% 0px" });
    items.forEach(i => io.observe(i));
  } else items.forEach(i => i.classList.add("in"));
  const chips = document.querySelectorAll("[data-nfilter]");
  chips.forEach(b => b.addEventListener("click", () => {
    const apply = () => {
      chips.forEach(o => o.setAttribute("aria-pressed", String(o === b)));
      const k = b.dataset.nfilter;
      let year = null, any = false;
      document.querySelectorAll(".news-list > li").forEach(li => {
        if (li.classList.contains("nyear")) { if (year) year.hidden = !any; year = li; any = false; return; }
        li.hidden = k !== "all" && li.dataset.kind !== k;
        if (!li.hidden) { any = true; li.classList.add("in"); }
      });
      if (year) year.hidden = !any;
      pack();
    };
    if (document.startViewTransition && !reduce) document.startViewTransition(apply); else apply();
  }));

  // headings that rise into place, once, when they first scroll into view
  const reveal = document.querySelectorAll(".rise, .how-card");
  if ("IntersectionObserver" in window) {
    const ro = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    reveal.forEach(r => ro.observe(r));
  } else reveal.forEach(r => r.classList.add("in"));

  // full-screen opening photo drifts at a third of the scroll speed while it is on screen
  const hero = document.querySelector(".hero-photo");
  if (hero && !reduce) {
    let ticking = false;
    addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (scrollY < hero.offsetHeight) hero.style.setProperty("--drift", `${scrollY / 3}px`);
      });
    }, { passive: true });
  }

  // people: a portrait opens that person's full bio (copied from its template) in a dialog
  const bio = document.querySelector("dialog.bio-dialog");
  if (bio) {
    const body = bio.querySelector(".bio-dialog__body");
    document.querySelectorAll("[data-bio]").forEach(b => b.addEventListener("click", () => {
      body.replaceChildren(document.getElementById(`bio-${b.dataset.bio}`).content.cloneNode(true));
      bio.showModal();
    }));
    bio.addEventListener("click", e => { if (e.target === bio || e.target.closest(".zoom-close")) bio.close(); });
  }

  // photos (people strip, news cards): click one to see it full size; click anywhere or press Escape to close
  const zoom = document.querySelector("dialog.zoom");
  if (zoom) {
    const big = zoom.querySelector("img");
    document.querySelectorAll("[data-zoom]").forEach(b => b.addEventListener("click", () => {
      const s = b.querySelector("img");
      big.src = s.currentSrc || s.src; big.alt = s.alt;
      zoom.showModal();
    }));
    zoom.addEventListener("click", () => zoom.close());
  }

  // looping clips: play while visible, never under reduced motion
  const vids = document.querySelectorAll("video[data-autoplay]");
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause();
    }), { threshold: 0.25 });
    vids.forEach(v => io.observe(v));
  }
})();
