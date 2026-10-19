// Efectos de ratón y clic (el cursor «Flecha MN» va en styles.css; aquí su halo suave): luz que sigue al cursor e inclinación 3D en las tarjetas, fondo de la vitrina que
// reacciona, chispas al hacer clic, producto que vuela al carrito y tarjetas que aparecen al bajar.
// Nada de esto es necesario para usar la web: con «reducir movimiento» no se activa, y en pantallas táctiles solo
// quedan las chispas, el vuelo al carrito y la aparición al bajar.

const quieto = matchMedia('(prefers-reduced-motion: reduce)');
const fino = matchMedia('(hover: hover) and (pointer: fine)');

const INCLINABLES = '.card, .mundo, .mini-btn, .detail-photo';
const CLICABLES = 'button, a.btn, .mundo, .mini-btn, .chip, .sc-thumb, .cart-btn, .nav a';
const APARECEN = '.card, .mundo, .mini, .section-head';
const MAX_GRADOS = 7;

/* ---------- Luz e inclinación que siguen al cursor ---------- */

let pendiente = null;
let actual = null;

function moverLuz(e) {
  if (quieto.matches || !fino.matches) return;
  pendiente = e;
  if (actual === null) actual = requestAnimationFrame(aplicarLuz);
}

function aplicarLuz() {
  actual = null;
  const e = pendiente;
  if (!e) return;
  const t = e.target instanceof Element ? e.target : null;

  const caja = t?.closest(INCLINABLES);
  if (caja) {
    const r = caja.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    caja.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    caja.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    if (caja.classList.contains('detail-photo')) { caja.classList.add('fx-on'); return; } // la ficha acerca la foto, no la gira
    caja.style.setProperty('--ry', `${((x - 0.5) * 2 * MAX_GRADOS).toFixed(2)}deg`);
    caja.style.setProperty('--rx', `${((0.5 - y) * 2 * MAX_GRADOS).toFixed(2)}deg`);
    caja.classList.add('fx-on');
  }

  const vitrina = t?.closest('.showcase');
  if (vitrina) {
    const r = vitrina.getBoundingClientRect();
    vitrina.style.setProperty('--sx', `${(e.clientX - r.left).toFixed(0)}px`);
    vitrina.style.setProperty('--sy', `${(e.clientY - r.top).toFixed(0)}px`);
    vitrina.classList.add('fx-on');
    const foto = vitrina.querySelector('.sc-photo');
    if (foto) {
      const f = foto.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (f.left + f.width / 2)) / f.width));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (f.top + f.height / 2)) / f.height));
      foto.style.setProperty('--ry', `${(dx * MAX_GRADOS).toFixed(2)}deg`);
      foto.style.setProperty('--rx', `${(-dy * MAX_GRADOS).toFixed(2)}deg`);
    }
  }
}

function soltarLuz(e) {
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return;
  // pointerout también salta al pasar a un hijo: solo se suelta al salir de verdad de la caja.
  const llega = e.relatedTarget instanceof Element ? e.relatedTarget : null;
  for (const sel of [INCLINABLES, '.showcase']) {
    const caja = t.closest(sel);
    if (caja && !(llega && caja.contains(llega))) {
      caja.classList.remove('fx-on');
      caja.style.removeProperty('--rx');
      caja.style.removeProperty('--ry');
      if (sel === '.showcase') {
        const foto = caja.querySelector('.sc-photo');
        foto?.style.removeProperty('--rx');
        foto?.style.removeProperty('--ry');
      }
    }
  }
}

/* ---------- Chispas al hacer clic ---------- */

function chispas(e) {
  if (quieto.matches || e.button !== 0) return;
  const t = e.target instanceof Element ? e.target : null;
  if (!t?.closest(CLICABLES) || t.closest('[disabled], .disabled')) return;
  const capa = document.createElement('span');
  capa.className = 'fx-burst';
  capa.setAttribute('aria-hidden', 'true');
  capa.style.left = `${e.clientX}px`;
  capa.style.top = `${e.clientY}px`;
  capa.append(document.createElement('i'), document.createElement('i'));
  const n = 12;
  for (let k = 0; k < n; k++) {
    const s = document.createElement('b');
    const ang = (k / n) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 32 + Math.random() * 26;
    s.style.setProperty('--dx', `${(Math.cos(ang) * dist).toFixed(1)}px`);
    s.style.setProperty('--dy', `${(Math.sin(ang) * dist).toFixed(1)}px`);
    capa.append(s);
  }
  // Dentro de una ventana (ficha, compartir) va en ella: lo que está en body queda por debajo.
  (t.closest('dialog[open]') || document.body).append(capa);
  setTimeout(() => capa.remove(), 700);
}

/* ---------- Halo suave detrás de la flecha ---------- */

// Un solo brillo tenue que acompaña la punta del cursor con un pequeño retraso; se apaga si el ratón se queda quieto.
function prepararHalo() {
  if (quieto.matches || !fino.matches) return;
  const halo = document.createElement('span');
  halo.className = 'fx-halo';
  halo.setAttribute('aria-hidden', 'true');
  document.body.append(halo);
  let x = 0, y = 0, hx = 0, hy = 0, corriendo = false, apagar = 0;
  const paso = () => {
    hx += (x - hx) * 0.22;
    hy += (y - hy) * 0.22;
    halo.style.transform = `translate3d(${hx.toFixed(1)}px, ${hy.toFixed(1)}px, 0)`;
    if (Math.abs(x - hx) + Math.abs(y - hy) > 0.3) requestAnimationFrame(paso);
    else corriendo = false;
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    // Las ventanas (ficha, compartir) tapan lo que está en body: el halo se muda a la que esté abierta.
    const host = document.querySelector('dialog[open]') || document.body;
    if (halo.parentNode !== host) host.append(halo);
    if (!halo.classList.contains('visible')) { hx = e.clientX; hy = e.clientY; }
    x = e.clientX;
    y = e.clientY;
    halo.classList.add('visible');
    clearTimeout(apagar);
    apagar = setTimeout(() => halo.classList.remove('visible'), 1200);
    if (!corriendo) { corriendo = true; requestAnimationFrame(paso); }
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => halo.classList.remove('visible'));
}

/* ---------- Cola fina detrás de la flecha ---------- */

// Una sola línea delgada que sigue a la punta y se apaga enseguida (como un cometa).
const VIDA_COLA = 160; // ms de recorrido que se dibujan
function prepararCola() {
  if (quieto.matches || !fino.matches) return;
  const lienzo = document.createElement('canvas');
  lienzo.className = 'fx-lienzo';
  lienzo.setAttribute('aria-hidden', 'true');
  document.body.append(lienzo);
  const ctx = lienzo.getContext('2d');
  if (!ctx) return;
  let puntos = [];
  let dibujando = false;
  const medir = () => {
    const r = window.devicePixelRatio || 1;
    lienzo.width = innerWidth * r;
    lienzo.height = innerHeight * r;
    ctx.setTransform(r, 0, 0, r, 0, 0);
  };
  medir();
  addEventListener('resize', medir);
  const dibujar = () => {
    const ahora = performance.now();
    puntos = puntos.filter((p) => ahora - p.t < VIDA_COLA);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.lineCap = 'round';
    for (let i = 1; i < puntos.length; i++) {
      const vida = 1 - (ahora - puntos[i].t) / VIDA_COLA;
      ctx.strokeStyle = `rgba(${i % 2 ? '196, 181, 253' : '147, 197, 253'}, ${(0.95 * vida).toFixed(3)})`;
      ctx.lineWidth = 0.8 + vida * 2.6;
      ctx.beginPath();
      ctx.moveTo(puntos[i - 1].x, puntos[i - 1].y);
      ctx.lineTo(puntos[i].x, puntos[i].y);
      ctx.stroke();
    }
    if (puntos.length) requestAnimationFrame(dibujar);
    else dibujando = false;
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const host = document.querySelector('dialog[open]') || document.body;
    if (lienzo.parentNode !== host) host.append(lienzo);
    puntos.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (!dibujando) { dibujando = true; requestAnimationFrame(dibujar); }
  }, { passive: true });
}

/* ---------- Chispitas sueltas detrás de la flecha ---------- */

// Cada tanto recorrido suelta un destello pequeño que cae un poco y se apaga.
function prepararChispitas() {
  if (quieto.matches || !fino.matches) return;
  let ultimo = null;
  let recorrido = 0;
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (ultimo) recorrido += Math.hypot(e.clientX - ultimo.x, e.clientY - ultimo.y);
    ultimo = { x: e.clientX, y: e.clientY };
    if (recorrido < 70) return;
    recorrido = 0;
    const c = document.createElement('span');
    c.className = `fx-chispita${Math.random() < 0.4 ? ' azul' : ''}`;
    c.setAttribute('aria-hidden', 'true');
    c.style.left = `${e.clientX + (Math.random() * 16 - 8)}px`;
    c.style.top = `${e.clientY + (Math.random() * 10)}px`;
    c.style.setProperty('--s', (0.6 + Math.random() * 0.6).toFixed(2));
    (document.querySelector('dialog[open]') || document.body).append(c);
    setTimeout(() => c.remove(), 750);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { ultimo = null; });
}

/* ---------- El producto vuela al carrito ---------- */

// Busca la foto que está junto al botón (tarjeta, vitrina o ficha) y la lleva hasta el carrito.
export function volarAlCarrito(desde) {
  const carrito = document.getElementById('cart-btn');
  if (!carrito) return;
  const latir = () => {
    carrito.classList.remove('fx-bump');
    void carrito.offsetWidth; // reinicia la animación
    carrito.classList.add('fx-bump');
  };
  if (quieto.matches || !desde) return latir();
  const caja = desde.closest('.card, .showcase, .detail');
  const img = caja?.querySelector('.photo img, .sc-photo img, .detail-photo img');
  const destino = carrito.getBoundingClientRect();
  if (!img || !destino.width) return latir();
  const r = img.getBoundingClientRect();
  if (!r.width) return latir();

  const lado = Math.min(r.width, r.height, 160);
  const copia = img.cloneNode();
  copia.removeAttribute('id');
  copia.alt = '';
  copia.className = 'fx-fly';
  copia.setAttribute('aria-hidden', 'true');
  Object.assign(copia.style, { left: `${r.left + (r.width - lado) / 2}px`, top: `${r.top + (r.height - lado) / 2}px`, width: `${lado}px`, height: `${lado}px` });
  document.body.append(copia);
  const dx = destino.left + destino.width / 2 - (r.left + r.width / 2);
  const dy = destino.top + destino.height / 2 - (r.top + r.height / 2);
  const vuelo = copia.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 80}px) scale(.55) rotate(-8deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(-14deg)`, opacity: 0.4 },
  ], { duration: 720, easing: 'cubic-bezier(.45, 0, .2, 1)' });
  vuelo.onfinish = () => { copia.remove(); latir(); };
  vuelo.oncancel = () => copia.remove();
}

// En la ficha el carrito queda detrás de la ventana: el botón late y sube un «+1».
export function celebrarEnFicha(boton) {
  if (!boton || quieto.matches) return;
  boton.classList.remove('fx-ok');
  void boton.offsetWidth;
  boton.classList.add('fx-ok');
  const r = boton.getBoundingClientRect();
  const mas = document.createElement('span');
  mas.className = 'fx-mas';
  mas.textContent = '+1';
  mas.setAttribute('aria-hidden', 'true');
  mas.style.left = `${r.left + r.width / 2}px`;
  mas.style.top = `${r.top}px`;
  (boton.closest('dialog[open]') || document.body).append(mas);
  setTimeout(() => mas.remove(), 900);
}

/* ---------- Aparecen al bajar ---------- */

let mirador = null;

function vigilar(raiz) {
  if (!mirador) return;
  const lista = raiz.matches?.(APARECEN) ? [raiz] : [];
  lista.push(...(raiz.querySelectorAll?.(APARECEN) || []));
  for (const n of lista) {
    if (n.classList.contains('fx-reveal')) continue;
    n.classList.add('fx-reveal');
    mirador.observe(n);
  }
}

function prepararAparicion(app) {
  if (quieto.matches || !('IntersectionObserver' in window) || !app) return;
  mirador = new IntersectionObserver((entradas) => {
    // Las que entran juntas aparecen una tras otra.
    let orden = 0;
    for (const en of entradas) {
      if (!en.isIntersecting) continue;
      en.target.style.setProperty('--fx-delay', `${Math.min(orden++, 6) * 45}ms`);
      en.target.classList.add('fx-in');
      mirador.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -40px 0px' });
  new MutationObserver((cambios) => {
    for (const c of cambios) for (const n of c.addedNodes) if (n.nodeType === 1) vigilar(n);
  }).observe(app, { childList: true, subtree: true });
  vigilar(app);
}

export function iniciarEfectos(app) {
  document.addEventListener('pointermove', moverLuz, { passive: true });
  document.addEventListener('pointerout', soltarLuz, { passive: true });
  document.addEventListener('pointerdown', chispas, { passive: true });
  prepararAparicion(app);
  // Efecto del cursor: halo por defecto; ?cursor=cola, ?cursor=chispitas o ?cursor=ninguno para probar otros.
  const efecto = new URLSearchParams(location.search).get('cursor');
  if (efecto === 'cola') prepararCola();
  else if (efecto === 'chispitas') prepararChispitas();
  else if (efecto !== 'ninguno') prepararHalo();
}
