import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisarCedula, revisarTelefono, revisarCliente } from '../public/datos-cliente.js';

test('celular: los seis prefijos y varias formas de escribirlo', () => {
  for (const p of ['0412', '0422', '0414', '0424', '0416', '0426']) assert.equal(revisarTelefono(`${p}1234567`).valor, `${p}-1234567`);
  assert.equal(revisarTelefono('(0414) 123-45.67').valor, '0414-1234567');
  assert.equal(revisarTelefono('+58 424 1234567').valor, '0424-1234567');
  assert.equal(revisarTelefono('584161234567').valor, '0416-1234567');
  assert.equal(revisarTelefono('4261234567').valor, '0426-1234567');
  for (const malo of ['', '0212-1234567', '0415-1234567', '0412-123456', '0412-12345678', 'abc']) assert.ok(revisarTelefono(malo).error, malo);
});

test('cédula: canónica, con V por defecto', () => {
  assert.equal(revisarCedula('V-12.345.678').valor, 'V12345678');
  assert.equal(revisarCedula('e 84123456').valor, 'E84123456');
  assert.equal(revisarCedula('9876543').valor, 'V9876543');
  for (const malo of ['', 'V12345', 'J123456789', '0000000', 'V1234567890']) assert.ok(revisarCedula(malo).error, malo);
});

test('nombre y apellido obligatorios, solo letras', () => {
  assert.deepEqual(revisarCliente({ nombre: ' María  José ', apellido: "D'Angelo", cedula: '12345678', telefono: '04121234567' }).datos,
    { nombre: 'María José', apellido: "D'Angelo", cedula: 'V12345678', telefono: '0412-1234567' });
  const { errores } = revisarCliente({ nombre: 'A', apellido: '', cedula: '', telefono: '' });
  assert.deepEqual(Object.keys(errores), ['nombre', 'apellido', 'cedula', 'telefono']);
});
