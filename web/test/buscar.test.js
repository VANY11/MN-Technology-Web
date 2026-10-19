import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indice, puntaje, distancia } from '../public/buscar.js';

const prod = (...t) => indice(t);
const audifonos = prod('Audífonos Bluetooth P9', 'GENERICO', 'Audio');
const forro = prod('Forro Samsung A16 360 unicolor', 'SAMSUNG', 'Accesorios Telefonía');
const cargador = prod('Cargador tipo C 20W', 'XIAOMI', 'Cargadores');

test('encuentra lo escrito bien, sin acentos y por inicio de palabra', () => {
  assert.ok(puntaje(audifonos, 'audífonos') > 0);
  assert.ok(puntaje(audifonos, 'audifonos') > 0);
  assert.ok(puntaje(forro, 'sams') > 0);
  assert.ok(puntaje(forro, 'forro a16') > 0);
});

test('tolera errores de ortografía', () => {
  assert.ok(puntaje(forro, 'samsumg') > 0);
  assert.ok(puntaje(forro, 'sansung') > 0);
  assert.ok(puntaje(cargador, 'cargadro') > 0);
  assert.ok(puntaje(audifonos, 'audifonso') > 0);
  assert.ok(puntaje(audifonos, 'blutooth') > 0);
  assert.ok(puntaje(forro, 'foro') > 0);
});

test('no mezcla cosas distintas', () => {
  assert.equal(puntaje(audifonos, 'forro'), 0);
  assert.equal(puntaje(cargador, 'samsung'), 0);
  assert.equal(puntaje(forro, 'forro xiaomi'), 0);
  assert.equal(puntaje(cargador, 'pc'), 0);
});

test('lo exacto pesa más que lo aproximado', () => {
  assert.ok(puntaje(forro, 'samsung') > puntaje(forro, 'samsumg'));
});

test('distancia con transposición', () => {
  assert.equal(distancia('abcd', 'abdc'), 1);
  assert.equal(distancia('casa', 'casa'), 0);
  assert.ok(distancia('telefono', 'xyz', 2) > 2);
});
