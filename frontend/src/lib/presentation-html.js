/** Extrae un documento HTML de un mensaje del agente (completo o truncado). */
export function extractPresentationHtml(text = "") {
  const raw = String(text || "");
  if (!raw.trim()) return "";

  let chunk = "";
  const fencedClosed = raw.match(/```html\s*([\s\S]*?)```/i);
  if (fencedClosed?.[1]?.includes("<")) chunk = fencedClosed[1].trim();
  else {
    const fencedOpen = raw.match(/```html\s*([\s\S]*)$/i);
    if (fencedOpen?.[1]?.includes("<")) chunk = fencedOpen[1].replace(/```\s*$/, "").trim();
  }
  if (!chunk) {
    const doctypeClosed = raw.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
    if (doctypeClosed?.[1]) chunk = doctypeClosed[1].trim();
  }
  if (!chunk) {
    const htmlClosed = raw.match(/(<html[\s\S]*<\/html>)/i);
    if (htmlClosed?.[1]) chunk = htmlClosed[1].trim();
  }
  if (!chunk) {
    const doctypeOpen = raw.match(/(<!DOCTYPE html[\s\S]*)$/i);
    if (doctypeOpen?.[1]?.includes("<")) chunk = doctypeOpen[1].trim();
  }
  if (!chunk) {
    const htmlOpen = raw.match(/(<html[\s\S]*)$/i);
    if (htmlOpen?.[1]) chunk = htmlOpen[1].trim();
  }
  if (!chunk) return "";

  return buildReliablePresentation(chunk);
}

/**
 * Shell ATV: stage 16:9 + nav + auto-fit del contenido al lienzo
 * (evita slides chicos arriba a la izquierda o cortados a la derecha).
 */
export function buildReliablePresentation(html) {
  if (typeof DOMParser === "undefined") {
    return injectFallbackRuntime(ensureClosedHtml(html));
  }

  const doc = new DOMParser().parseFromString(ensureClosedHtml(html), "text/html");
  const slides = Array.from(
    doc.querySelectorAll("section.slide, .slide, section[data-slide], body > section")
  );

  if (!slides.length) {
    return injectFallbackRuntime(ensureClosedHtml(html));
  }

  const styleChunks = Array.from(doc.querySelectorAll("style"))
    .map((el) => el.textContent || "")
    .filter(Boolean);
  const fontLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
    .map((el) => el.getAttribute("href"))
    .filter((href) => href && /fonts\.google/i.test(href));

  // El slide se monta tal cual: NO se envuelve el contenido. Un wrapper
  // `position: relative` se convertiría en el bloque contenedor de los hijos
  // `position: absolute` del diseñador (logo, folio, barra) y los desanclaría
  // del lienzo de 1920×1080 — que es exactamente lo que los superponía.
  const slidesHtml = slides
    .map((s) => {
      const clone = s.cloneNode(true);
      clone.classList.add("slide");
      clone.removeAttribute("hidden");
      clone.classList.remove("atv-active", "active", "current");
      clone.removeAttribute("style");
      return clone.outerHTML;
    })
    .join("\n");

  const designerCss = styleChunks.join("\n\n");
  const fontTags = fontLinks
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Presentación</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${fontTags || '<link href="https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />'}
<style>
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: #0b0b0b;
  overflow: hidden;
}
#atv-viewport {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #0b0b0b;
}
/* El escenario se posiciona y centra por transform, no por layout: un item de
   grid de 1920x1080 dentro de un viewport menor no se centra de forma fiable. */
#atv-stage {
  position: absolute;
  left: 0;
  top: 0;
  width: 1920px;
  height: 1080px;
  transform-origin: 0 0;
  overflow: hidden;
  background: #000;
}
/* El slide ES el lienzo: bloque contenedor real de 1920x1080.
   min-height en vez de height para poder medir el desborde y corregirlo
   escalando hacia abajo (nunca hacia arriba). El padding lo pone el disenador. */
#atv-stage > .slide {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  right: auto !important;
  bottom: auto !important;
  width: 1920px !important;
  min-width: 1920px !important;
  max-width: none !important;
  min-height: 1080px !important;
  max-height: none !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  transform-origin: top center;
}
#atv-stage > .slide:not(.atv-active) {
  display: none !important;
}
#atv-ui {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  pointer-events: none;
}
#atv-ui .atv-btn {
  pointer-events: auto;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(0,0,0,.6);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}
#atv-ui .atv-btn.atv-next {
  background: #c0392b;
  border-color: #c0392b;
}
#atv-counter {
  color: rgba(255,255,255,.55);
  font: 600 12px/1 system-ui, sans-serif;
  letter-spacing: .08em;
}
</style>
<style id="designer-css">
/* CSS del diseñador */
${designerCss}
</style>
<style id="atv-overrides">
/* Gana siempre sobre el CSS del diseñador para las dimensiones del frame.
   NO se toca ni el padding ni el display: son decisiones de composición. */
#atv-stage > .slide {
  width: 1920px !important;
  min-width: 1920px !important;
  min-height: 1080px !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
}
</style>
</head>
<body>
<div id="atv-viewport">
  <div id="atv-stage">
${slidesHtml}
  </div>
</div>
<div id="atv-ui">
  <button type="button" class="atv-btn atv-prev" data-atv-nav="prev" aria-label="Anterior">←</button>
  <span id="atv-counter">01 / 01</span>
  <button type="button" class="atv-btn atv-next" data-atv-nav="next" aria-label="Siguiente">→</button>
</div>
<script>
(function () {
  var STAGE_W = 1920, STAGE_H = 1080;
  var stage = document.getElementById("atv-stage");
  var slides = Array.prototype.slice.call(stage.querySelectorAll(":scope > .slide"));
  var counter = document.getElementById("atv-counter");
  var i = 0;

  function fitStage() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var scale = Math.min(vw / STAGE_W, vh / STAGE_H);
    var x = (vw - STAGE_W * scale) / 2;
    var y = (vh - STAGE_H * scale) / 2;
    stage.style.transform =
      "translate(" + x + "px," + y + "px) scale(" + scale + ")";
  }

  // Red de seguridad: si el slide desborda el lienzo lo achicamos.
  // Nunca lo agrandamos — escalar hacia arriba destruye la jerarquía
  // tipográfica que decidió el diseñador.
  function fitContent(slide) {
    if (!slide) return;
    slide.style.transform = "";
    void slide.offsetWidth; // reflow
    var w = Math.max(slide.scrollWidth, 1);
    var h = Math.max(slide.scrollHeight, 1);
    var s = Math.min(STAGE_W / w, STAGE_H / h);
    if (!isFinite(s) || s <= 0 || s >= 1) return;
    slide.style.transform = "scale(" + Math.max(s, 0.5) + ")";
  }

  // El fit no puede depender del render loop: en un iframe throttleado
  // requestAnimationFrame no dispara y el slide queda desbordado. Medimos
  // sincrónicamente y re-medimos por timeout (las webfonts cambian las
  // métricas después del primer layout).
  function scheduleFit(slide) {
    fitContent(slide);
    [0, 120, 500].forEach(function (ms) {
      setTimeout(function () { fitContent(slide); }, ms);
    });
  }

  var ro = window.ResizeObserver
    ? new ResizeObserver(function () { fitContent(slides[i]); })
    : null;
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fitContent(slides[i]); });
  }

  function show(n) {
    if (!slides.length) return;
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function (s, idx) {
      var on = idx === i;
      s.classList.toggle("atv-active", on);
      if (!on) {
        s.style.removeProperty("display");
        s.style.transform = "";
        if (ro) ro.unobserve(s);
        return;
      }
      if (ro) ro.observe(s);
      // El display activo lo decide el CSS del diseñador (flex, grid, block).
      // Solo intervenimos si su propio CSS deja el slide oculto.
      if (getComputedStyle(s).display === "none") {
        s.style.setProperty("display", "block", "important");
      }
      scheduleFit(s);
    });
    if (counter) {
      counter.textContent =
        String(i + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
    }
  }

  function next() { show(i + 1); }
  function prev() { show(i - 1); }

  window.ATVDeck = {
    next: next,
    prev: prev,
    go: show,
    get index() { return i; },
    get count() { return slides.length; }
  };

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault(); next();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault(); prev();
    } else if (e.key === "Home") {
      e.preventDefault(); show(0);
    } else if (e.key === "End") {
      e.preventDefault(); show(slides.length - 1);
    }
  });

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-atv-nav]");
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    if (t.getAttribute("data-atv-nav") === "prev") prev();
    else next();
  }, true);

  window.addEventListener("message", function (e) {
    var d = e && e.data;
    if (!d || d.type !== "atv-slide-nav") return;
    if (d.dir === "next") next();
    if (d.dir === "prev") prev();
  });

  window.addEventListener("resize", function () {
    fitStage();
    fitContent(slides[i]);
  });

  fitStage();
  show(0);
})();
</script>
</body>
</html>`;
}

function ensureClosedHtml(html) {
  let out = String(html || "").trim();
  if (!out) return "";
  if (!/<!DOCTYPE/i.test(out) && /<html/i.test(out)) out = `<!DOCTYPE html>\n${out}`;
  if (/<html/i.test(out) && !/<\/html>/i.test(out)) {
    if (!/<\/body>/i.test(out)) out += "\n</body>";
    out += "\n</html>";
  }
  return out;
}

function injectFallbackRuntime(html) {
  const runtime = `
<script>
(function(){
  if (window.ATVDeck) return;
  var slides = Array.prototype.slice.call(document.querySelectorAll("section.slide, .slide, body > section"));
  if (!slides.length) return;
  var i = 0;
  function show(n){
    i = Math.max(0, Math.min(slides.length-1, n));
    slides.forEach(function(s,idx){ s.style.display = idx===i ? "" : "none"; });
  }
  window.ATVDeck = { next:function(){show(i+1)}, prev:function(){show(i-1)}, go:show, get index(){return i}, get count(){return slides.length} };
  document.addEventListener("keydown", function(e){
    if(e.key==="ArrowRight"||e.key===" "){e.preventDefault();window.ATVDeck.next()}
    if(e.key==="ArrowLeft"){e.preventDefault();window.ATVDeck.prev()}
  });
  window.addEventListener("message", function(e){
    var d=e&&e.data; if(!d||d.type!=="atv-slide-nav")return;
    if(d.dir==="next")window.ATVDeck.next(); if(d.dir==="prev")window.ATVDeck.prev();
  });
  show(0);
})();
</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${runtime}</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${runtime}</html>`);
  return html + runtime;
}

export function stripPresentationHtml(text = "") {
  return String(text || "")
    .replace(/```html[\s\S]*?(```|$)/i, "")
    .replace(/<!DOCTYPE html[\s\S]*?(<\/html>|$)/i, "")
    .replace(/<html[\s\S]*?(<\/html>|$)/i, "")
    .trim();
}

export function downloadPresentationHtml(html, filename = "presentacion.html") {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPresentationPreview(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function latestPresentationHtml(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const html = extractPresentationHtml(m.content);
    if (html) return html;
  }
  return "";
}

export function postSlideNav(iframe, dir) {
  try {
    const win = iframe?.contentWindow;
    if (!win) return;
    if (win.ATVDeck) {
      if (dir === "next") win.ATVDeck.next();
      if (dir === "prev") win.ATVDeck.prev();
      return;
    }
    win.postMessage({ type: "atv-slide-nav", dir }, "*");
  } catch {
    /* ignore */
  }
}
