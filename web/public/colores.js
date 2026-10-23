// Colores de los productos. MN Tech guarda el color de cada producto en su campo «color» (o, en algunas
// categorías, en la especificación «Color»); si no tiene, la web no muestra nada. Un mismo modelo en varios
// colores son productos distintos (cada uno con su código y su stock): aquí se agrupan para ofrecer
// «otros colores» en la ficha. Lo usa app.js.

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Lo que se escribe en el campo cuando en realidad no hay color.
const VACIOS = new Set(['', '-', '--', '.', 'n/a', 'na', 'no', 'no aplica', 'sin color', 'ninguno', 'null', 'generico', 'n']);

// Nombre de color (sin acentos, en español o inglés) → color para la muestra.
const TONOS = {
  negro: '#111114', black: '#111114', 'negro mate': '#1d1d21', 'midnight': '#1c2433', medianoche: '#1c2433',
  blanco: '#ffffff', white: '#ffffff', 'blanco perla': '#f6f2ea', perla: '#f6f2ea', marfil: '#fbf6e9', crema: '#f5ecd7', hueso: '#efe8d8',
  gris: '#8a8d93', gray: '#8a8d93', grey: '#8a8d93', 'gris espacial': '#55575c', 'space gray': '#55575c', grafito: '#45474c', graphite: '#45474c',
  plata: '#c7c9cc', plateado: '#c7c9cc', plateada: '#c7c9cc', silver: '#c7c9cc', titanio: '#a19d94', titanium: '#a19d94', acero: '#9aa1a8',
  dorado: '#d4af37', dorada: '#d4af37', oro: '#d4af37', gold: '#d4af37', champan: '#e8d3a5', champagne: '#e8d3a5',
  'oro rosa': '#e0a899', 'rose gold': '#e0a899', bronce: '#a97142', cobre: '#b87333',
  rojo: '#d32f2f', roja: '#d32f2f', red: '#d32f2f', vino: '#7b1e2b', 'vinotinto': '#6d1a26', bordo: '#6d1a26', coral: '#ff7f61',
  rosado: '#f48fb1', rosada: '#f48fb1', rosa: '#f48fb1', pink: '#f48fb1', fucsia: '#d81b80', magenta: '#c2185b',
  naranja: '#f57c00', anaranjado: '#f57c00', orange: '#f57c00', mostaza: '#d4a017',
  amarillo: '#fbc02d', amarilla: '#fbc02d', yellow: '#fbc02d',
  verde: '#2e9d4f', green: '#2e9d4f', 'verde menta': '#98d8b8', menta: '#98d8b8', mint: '#98d8b8', 'verde oliva': '#708238', oliva: '#708238',
  'verde militar': '#4b5320', 'verde agua': '#7fd1c1', lima: '#a4d65e', turquesa: '#26c6da', aguamarina: '#5fd3c3',
  azul: '#1e63d6', blue: '#1e63d6', 'azul marino': '#1b2a4e', marino: '#1b2a4e', navy: '#1b2a4e', 'azul rey': '#2541b2',
  'azul cielo': '#7ec8f2', celeste: '#7ec8f2', 'sky blue': '#7ec8f2', 'azul claro': '#8ab8f0', 'azul oscuro': '#1d2f6f', cian: '#00bcd4',
  morado: '#7b3fbf', morada: '#7b3fbf', purpura: '#7b3fbf', purple: '#7b3fbf', violeta: '#8e5bd8', lila: '#c3a6e6', lavanda: '#c9b8ef', lavender: '#c9b8ef',
  marron: '#795548', cafe: '#6f4e37', brown: '#795548', chocolate: '#5d3a1a', beige: '#d9c6a5', arena: '#d8c39a', camel: '#c19a6b', nude: '#e3bc9a',
  transparente: 'transparent', transparent: 'transparent', clear: 'transparent', cristal: 'transparent',
};

const PALABRAS_SUELTAS = new Set(['claro', 'oscuro', 'mate', 'brillante', 'metalico', 'metalizado', 'pastel', 'neon']);
const TRANSPARENTE = 'linear-gradient(135deg, #ffffff 0 40%, #d9dde3 40% 60%, #ffffff 60%)';
const MULTI = 'conic-gradient(#d32f2f, #fbc02d, #2e9d4f, #1e63d6, #7b3fbf, #d32f2f)';

const tono = (parte) => {
  const k = sinAcentos(parte).replace(/\s+/g, ' ');
  if (k in TONOS) return TONOS[k];
  // «Azul pacífico», «Negro medianoche»: la primera palabra que sea un color conocido.
  for (const w of k.split(' ')) if (!PALABRAS_SUELTAS.has(w) && w in TONOS) return TONOS[w];
  return null;
};

// El color de un producto, bien escrito («negro» → «Negro»), o null si no tiene.
export function colorDe(item) {
  let raw = item?.color;
  if (typeof raw !== 'string' || VACIOS.has(sinAcentos(raw))) {
    const spec = Array.isArray(item?.especificaciones) ? item.especificaciones.find((s) => esCampoColor(s?.campo)) : null;
    raw = spec?.valor;
  }
  if (typeof raw !== 'string') return null;
  const c = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (VACIOS.has(sinAcentos(c))) return null;
  return c.charAt(0).toLocaleUpperCase('es') + c.slice(1);
}

export const esCampoColor = (campo) => sinAcentos(campo) === 'color';

// Fondo CSS de la muestra: un color, dos mitades («Negro/Rojo»), arcoíris («Multicolor») o null si no se conoce.
export function muestra(nombre) {
  const k = sinAcentos(nombre);
  if (!k) return null;
  if (/multicolor|varios|surtido|arcoiris|rainbow/.test(k)) return MULTI;
  const partes = k.split(/\s*(?:\/|,|\+|&|\by\b|\bcon\b|-)\s*/).filter(Boolean);
  const tonos = partes.map(tono).filter(Boolean).slice(0, 2);
  if (!tonos.length) return null;
  if (tonos.length === 1) return tonos[0] === 'transparent' ? TRANSPARENTE : tonos[0];
  const [a, b] = tonos.map((t) => (t === 'transparent' ? '#e9edf2' : t));
  return `linear-gradient(135deg, ${a} 0 50%, ${b} 50%)`;
}

// Clave de «el mismo producto en otro color»: categoría, marca, modelo y el nombre sin su color.
function claveModelo(item, color) {
  let nombre = ` ${sinAcentos(item.nombre).replace(/[^a-z0-9ñ]+/g, ' ')} `;
  const c = sinAcentos(color).replace(/[^a-z0-9ñ]+/g, ' ').trim();
  if (c) nombre = nombre.replace(` ${c} `, ' ');
  for (const w of c.split(' ')) if (w.length > 2) nombre = nombre.replace(` ${w} `, ' ');
  return [item.categoria, item.marca, item.modelo, nombre.replace(/\s+/g, ' ').trim()].map(sinAcentos).join('|');
}

// Para cada producto con color, la lista de sus variantes de color (él incluido) cuando hay más de una.
export function agruparColores(items) {
  const grupos = new Map();
  for (const it of items) {
    const color = colorDe(it);
    if (!color) continue;
    const k = claveModelo(it, color);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(it);
  }
  const out = new Map();
  for (const lista of grupos.values()) {
    const distintos = new Set(lista.map((it) => sinAcentos(colorDe(it))));
    if (distintos.size < 2) continue;
    // Un producto por color (si hay dos con el mismo color, el de más stock), en orden alfabético.
    const porColor = new Map();
    for (const it of lista) {
      const c = sinAcentos(colorDe(it));
      if (!porColor.has(c) || it.disponible > porColor.get(c).disponible) porColor.set(c, it);
    }
    const variantes = [...porColor.values()].sort((a, b) => colorDe(a).localeCompare(colorDe(b), 'es'));
    for (const it of lista) out.set(it, variantes);
  }
  return out;
}

// ¿El nombre ya dice el color? Así no se repite en el pedido («Forro negro — Negro»).
export const nombreDiceColor = (nombre, color) => ` ${sinAcentos(nombre).replace(/[^a-z0-9ñ]+/g, ' ')} `.includes(` ${sinAcentos(color).replace(/[^a-z0-9ñ]+/g, ' ').trim()} `);
