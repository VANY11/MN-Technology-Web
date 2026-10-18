import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarPromos, promoDe, etiquetaPromo } from '../public/promos.js';

const promos = [
  { id: 1, tipo: 'categoria', titulo: 'Forros', categoria: 'Accesorios', categorias: ['Accesorios', 'Forros'], descuento: 'porcentaje', porcentaje: 10 },
  { id: 2, tipo: 'marca', titulo: 'Samsung', marca: ' samsung ', categorias: [], descuento: 'porcentaje', porcentaje: 20, etiqueta: 'Semana Samsung' },
  { id: 3, tipo: 'producto', titulo: 'A16', producto: 'MN-0730', categorias: [], descuento: 'precio', precio_oferta: 150 },
  { id: 4, tipo: 'producto', titulo: 'Caro', producto: 'MN-1', categorias: [], descuento: 'precio', precio_oferta: 500 },
  { id: 5, tipo: 'aviso', titulo: 'Abrimos el domingo', categorias: [] },
];
const items = () => [
  { codigo: 'MN-0730', marca: 'SAMSUNG', categoria: 'Teléfonos', precio: 200, precio_ves: 7000, precio_cop: 800000 },
  { codigo: 'MN-2', marca: 'Samsung', categoria: 'Forros', precio: 10, precio_ves: 333.33, precio_cop: null },
  { codigo: 'MN-3', marca: 'Xiaomi', categoria: 'forros', precio: 5, precio_ves: 175, precio_cop: 20000 },
  { codigo: 'MN-1', marca: null, categoria: 'Otros', precio: 100, precio_ves: null, precio_cop: null },
  { codigo: 'MN-9', marca: 'Xiaomi', categoria: 'Teléfonos', precio: 90, precio_ves: null, precio_cop: null },
];

test('producto gana sobre marca, y marca sobre categoría', () => {
  const [a16, forroSamsung, forroXiaomi, , otro] = items();
  assert.equal(promoDe(a16, promos).id, 3);
  assert.equal(promoDe(forroSamsung, promos).id, 2);
  assert.equal(promoDe(forroXiaomi, promos).id, 1);
  assert.equal(promoDe(otro, promos), null);
});

test('pone el precio de oferta en las tres monedas y guarda el de antes', () => {
  const list = items();
  aplicarPromos(list, promos);
  const [a16, forroSamsung, forroXiaomi, caro, otro] = list;
  assert.deepEqual([a16.precio, a16.precio_ves, a16.precio_cop], [150, 5250, 600000]);
  assert.deepEqual(a16.antes, { precio: 200, precio_ves: 7000, precio_cop: 800000 });
  assert.deepEqual([forroSamsung.precio, forroSamsung.precio_ves, forroSamsung.precio_cop], [8, 266.66, null]);
  assert.deepEqual([forroXiaomi.precio, forroXiaomi.precio_cop], [4.5, 18000]);
  assert.equal(caro.precio, 100);
  assert.equal(caro.antes, undefined);
  assert.equal(caro.promo.id, 4);
  assert.equal(otro.promo, undefined);
  assert.deepEqual([etiquetaPromo(a16), etiquetaPromo(forroSamsung), etiquetaPromo(forroXiaomi), etiquetaPromo(caro)], ['Oferta', 'Semana Samsung', '-10%', null]);
});

test('lugares: sin el dato, vitrina y destacados', async () => {
  const { enLugar } = await import('../public/promos.js');
  assert.equal(enLugar({}, 'vitrina'), true);
  assert.equal(enLugar({}, 'nuevos'), false);
  assert.equal(enLugar({ lugares: ['nuevos'] }, 'nuevos'), true);
  assert.equal(enLugar({ lugares: ['nuevos'] }, 'vitrina'), false);
});
