import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enTemporada, estiloActivo } from '../public/navidad.js';

const cfg = { estilo: 'completa', desde: '11-01', hasta: '01-06' };
const dia = (m, d) => new Date(2026, m - 1, d);

test('la temporada cruza el año e incluye ambos extremos', () => {
  assert.equal(enTemporada(cfg, dia(10, 31)), false);
  assert.equal(enTemporada(cfg, dia(11, 1)), true);
  assert.equal(enTemporada(cfg, dia(12, 24)), true);
  assert.equal(enTemporada(cfg, dia(1, 6)), true);
  assert.equal(enTemporada(cfg, dia(1, 7)), false);
  assert.equal(enTemporada({ desde: '12-01', hasta: '12-31' }, dia(12, 15)), true);
  assert.equal(enTemporada({ desde: '12-01', hasta: '12-31' }, dia(1, 2)), false);
  assert.equal(enTemporada({ desde: 'x', hasta: '01-06' }, dia(12, 15)), false);
});

test('la dirección manda para probar; si no, config.js en temporada', () => {
  assert.equal(estiloActivo(cfg, '?navidad=luces', dia(7, 1)), 'luces');
  assert.equal(estiloActivo(cfg, '?navidad=no', dia(12, 24)), null);
  assert.equal(estiloActivo(cfg, '', dia(12, 24)), 'completa');
  assert.equal(estiloActivo(cfg, '', dia(7, 1)), null);
  assert.equal(estiloActivo({ ...cfg, estilo: '' }, '', dia(12, 24)), null);
});
