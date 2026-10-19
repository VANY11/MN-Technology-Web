// Tema claro / oscuro. Sigue al equipo hasta que el cliente elige con el botón; la elección queda guardada.
// Script clásico en <head> (no módulo) para fijar el tema antes de pintar y evitar el destello.
(() => {
  const raiz = document.documentElement;
  const sistema = matchMedia('(prefers-color-scheme: dark)');
  const leer = () => { try { return localStorage.getItem('tema'); } catch { return null; } };
  const actual = () => raiz.dataset.theme || (sistema.matches ? 'dark' : 'light');
  const guardado = leer();
  if (guardado === 'light' || guardado === 'dark') raiz.dataset.theme = guardado;

  const pintar = () => {
    const oscuro = actual() === 'dark';
    for (const b of document.querySelectorAll('[data-tema]')) {
      b.setAttribute('aria-pressed', String(oscuro));
      b.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      b.title = oscuro ? 'Modo claro' : 'Modo oscuro';
    }
  };
  sistema.addEventListener('change', pintar);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-tema]')) return;
    const nuevo = actual() === 'dark' ? 'light' : 'dark';
    raiz.dataset.theme = nuevo;
    try { localStorage.setItem('tema', nuevo); } catch {}
    pintar();
  });
  document.addEventListener('DOMContentLoaded', pintar);
})();
