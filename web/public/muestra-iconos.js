// MUESTRA (no fusionar): tres estilos de íconos animados y transiciones entre páginas para que Yvan elija.
// El estilo va en html[data-estilo] (a, b o c), se elige con ?estilo=a|b|c o con el selector flotante,
// y queda guardado en localStorage "estilo-muestra".
(() => {
  const raiz = document.documentElement;
  const ESTILOS = { a: 'Trazo vivo', b: 'Burbuja 3D', c: 'Neón' };
  const leer = () => { try { return localStorage.getItem('estilo-muestra'); } catch { return null; } };
  const pedido = new URLSearchParams(location.search).get('estilo');
  const fijar = (e) => {
    raiz.dataset.estilo = e;
    try { localStorage.setItem('estilo-muestra', e); } catch {}
    for (const b of document.querySelectorAll('.estilo-sel button')) b.setAttribute('aria-pressed', String(b.dataset.e === e));
    redibujar(document);
  };
  raiz.dataset.estilo = ESTILOS[pedido] ? pedido : ESTILOS[leer()] ? leer() : 'a';
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');

  // Íconos que se "dibujan": cada trazo mide 1 (pathLength) y se anima su stroke-dashoffset en CSS.
  const preparar = (svg) => {
    if (svg.dataset.trazo) return;
    svg.dataset.trazo = '1';
    for (const s of svg.querySelectorAll('path, rect, circle, line, polyline')) s.setAttribute('pathLength', '1');
  };
  function redibujar(base) {
    for (const svg of base.querySelectorAll('svg')) {
      preparar(svg);
      svg.classList.remove('dibuja');
      void svg.getBoundingClientRect();
      svg.classList.add('dibuja');
    }
  }
  new MutationObserver((cambios) => {
    for (const c of cambios) for (const n of c.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'svg') redibujar(n.parentNode || n);
      else redibujar(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Al pasar el mouse sobre un botón o tarjeta, su ícono se vuelve a dibujar.
  document.addEventListener('pointerover', (e) => {
    const caja = e.target.closest('.tile, .chip, .fitem, .nav a, .cart-btn, .tema-btn, .btn, .mini-btn');
    if (!caja || caja.contains(e.relatedTarget)) return;
    for (const svg of caja.querySelectorAll('svg')) {
      svg.classList.remove('dibuja', 'salta');
      void svg.getBoundingClientRect();
      svg.classList.add('dibuja', 'salta');
    }
  });

  // Pastilla de la navegación que se desliza hasta la sección activa.
  const pastilla = () => {
    const nav = document.getElementById('nav');
    const act = nav?.querySelector('a[aria-current="page"]');
    if (!nav || !act) { nav?.style.setProperty('--p-w', '0px'); return; }
    nav.style.setProperty('--p-x', `${act.offsetLeft}px`);
    nav.style.setProperty('--p-w', `${act.offsetWidth}px`);
  };
  addEventListener('hashchange', () => requestAnimationFrame(pastilla));
  addEventListener('resize', pastilla);

  // Transición entre páginas con la View Transitions API. Solo al cambiar de página, no al filtrar.
  const pagina = (h) => (h.replace(/^#\/?/, '').split('?')[0] || 'inicio');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || !document.startViewTransition || quieto.matches || e.metaKey || e.ctrlKey || e.button !== 0) return;
    const destino = a.getAttribute('href');
    if (pagina(destino) === pagina(location.hash)) return;
    e.preventDefault();
    raiz.style.setProperty('--vt-x', `${e.clientX}px`);
    raiz.style.setProperty('--vt-y', `${e.clientY}px`);
    document.startViewTransition(() => new Promise((listo) => {
      addEventListener('hashchange', () => listo(), { once: true });
      location.hash = destino;
    }));
  }, true);

  // Selector flotante, solo para esta muestra.
  document.addEventListener('DOMContentLoaded', () => {
    const sel = document.createElement('div');
    sel.className = 'estilo-sel';
    sel.setAttribute('role', 'group');
    sel.setAttribute('aria-label', 'Estilo de la muestra');
    const t = document.createElement('span');
    t.textContent = 'Muestra:';
    sel.append(t);
    for (const [e, nombre] of Object.entries(ESTILOS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.e = e;
      b.textContent = `${e.toUpperCase()} · ${nombre}`;
      b.setAttribute('aria-pressed', String(raiz.dataset.estilo === e));
      b.addEventListener('click', () => fijar(e));
      sel.append(b);
    }
    document.body.append(sel);
    setTimeout(pastilla, 300);
  });
})();
