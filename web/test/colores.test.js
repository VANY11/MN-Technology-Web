import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorDe, muestra, agruparColores, nombreDiceColor } from '../public/colores.js';

const prod = (nombre, color, extra = {}) => ({ nombre, color, marca: 'SAMSUNG', categoria: 'Forros', modelo: null, disponible: 1, ...extra });

test('el color sale del campo color o de la especificación Color, y lo vacío no cuenta', () => {
  assert.equal(colorDe(prod('Forro', 'negro')), 'Negro');
  assert.equal(colorDe(prod('Forro', '  ')), null);
  assert.equal(colorDe(prod('Forro', 'N/A')), null);
  assert.equal(colorDe(prod('Forro', null)), null);
  assert.equal(colorDe(prod('Teclado', null, { especificaciones: [{ campo: 'Color', valor: 'blanco' }] })), 'Blanco');
});

test('muestra: colores conocidos, combinados y desconocidos', () => {
  assert.equal(muestra('Negro'), '#111114');
  assert.equal(muestra('AZUL MARINO'), '#1b2a4e');
  assert.equal(muestra('Azul pacífico'), '#1e63d6');
  assert.match(muestra('Negro/Rojo'), /^linear-gradient/);
  assert.match(muestra('Multicolor'), /^conic-gradient/);
  assert.equal(muestra('Galaxia'), null);
});

test('agrupa el mismo producto en varios colores y deja solo los que no tienen hermanos', () => {
  const negro = prod('Forro Samsung A16 Negro', 'Negro', { disponible: 3 });
  const azul = prod('Forro Samsung A16 Azul', 'Azul');
  const otro = prod('Forro Samsung A15 Rojo', 'Rojo');
  const sin = prod('Forro Samsung A16', null);
  const g = agruparColores([negro, azul, otro, sin]);
  assert.deepEqual(g.get(negro), [azul, negro]);
  assert.equal(g.get(azul), g.get(negro));
  assert.equal(g.has(otro), false);
  assert.equal(g.has(sin), false);
});

test('no repite el color si el nombre ya lo dice', () => {
  assert.equal(nombreDiceColor('Forro A16 Negro', 'negro'), true);
  assert.equal(nombreDiceColor('Forro A16', 'Negro'), false);
  assert.equal(nombreDiceColor('Forro negrito', 'Negro'), false);
});
