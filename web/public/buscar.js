// Búsqueda tolerante a errores: «samsumg», «audifonos», «cargadro» o «iphon» encuentran lo que el cliente quiso
// decir. Cada palabra buscada tiene que aparecer en el producto, completa, como inicio de una palabra o con pocas
// letras cambiadas (1 en palabras de 4 a 6 letras, 2 desde 7). También iguala b/v, s/z/c suave, y/ll y la h muda.
// Lo usan el buscador del inicio y el catálogo (app.js).

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Forma «como suena»: lo que en español se escribe distinto pero suena igual.
const sonido = (w) => w
  .replace(/h/g, '')
  .replace(/v/g, 'b')
  .replace(/ll/g, 'y')
  .replace(/z/g, 's')
  .replace(/c([ei])/g, 's$1')
  .replace(/qu/g, 'k')
  .replace(/c/g, 'k')
  .replace(/(.)\1+/g, '$1');

export const palabras = (texto) => sinAcentos(texto).split(/[^a-z0-9ñ]+/).filter(Boolean);

// Distancia de edición con transposición (Damerau), cortando apenas pasa de `max`.
export function distancia(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let fila;
  for (let i = 1; i <= a.length; i++) {
    fila = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, fila[j - 1] + 1, prev[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      fila[j] = v;
      if (v < menor) menor = v;
    }
    if (menor > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev = fila;
  }
  return prev[b.length];
}

const tolerancia = (n) => (n >= 7 ? 2 : n >= 4 ? 1 : 0);

// Qué tan bien coincide una palabra buscada con una palabra del producto: 3 exacta o contenida, 2 inicio,
// 1 con errores, 0 nada.
function puntajePalabra(t, w) {
  if (w === t) return 3;
  if (w.startsWith(t)) return 2.5;
  if (t.length >= 3 && w.includes(t)) return 2;
  const tol = tolerancia(t.length);
  if (!tol) return 0;
  if (distancia(t, w, tol) <= tol) return 1.2;
  // Inicio con errores: «samsu» → «samsung», «audifo» → «audifonos».
  if (w.length > t.length && distancia(t, w.slice(0, t.length), tol) <= tol) return 1;
  const st = sonido(t), sw = sonido(w);
  if (st && (sw === st || sw.startsWith(st))) return 1.1;
  return 0;
}

// Índice de un producto: sus palabras (y las «como suenan»), hecho una vez por lista.
export function indice(textos) {
  const ws = palabras(textos.filter(Boolean).join(' '));
  return { ws: [...new Set(ws)], junto: ws.join(' ') };
}

// Puntaje de un producto para la búsqueda (0 = no aparece). Todas las palabras tienen que coincidir.
export function puntaje(idx, consulta) {
  const ts = palabras(consulta);
  if (!ts.length) return 1;
  let total = 0;
  for (const t of ts) {
    let mejor = 0;
    for (const w of idx.ws) {
      const p = puntajePalabra(t, w);
      if (p > mejor) mejor = p;
      if (mejor === 3) break;
    }
    // Códigos y modelos pegados: «a16» dentro de «galaxya16».
    if (!mejor && t.length >= 2 && /\d/.test(t) && idx.junto.replace(/ /g, '').includes(t)) mejor = 2;
    if (!mejor) return 0;
    total += mejor;
  }
  // La frase entera seguida suma un poco más.
  if (ts.length > 1 && idx.junto.includes(ts.join(' '))) total += 1;
  return total;
}
