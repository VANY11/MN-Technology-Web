// Datos del cliente en un pedido: nombre, apellido, cédula y celular venezolano, todos obligatorios.
// Lo usan el formulario del carrito (app.js) y la función /api/pedido, que vuelve a revisar todo.
// Cada revisión devuelve { valor } con el dato limpio o { error } con el mensaje para el cliente.

export const PREFIJOS_CELULAR = ['0412', '0422', '0414', '0424', '0416', '0426'];

const LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '.-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*\.?$/;

function revisarNombre(texto, que) {
  const valor = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (!valor) return { error: `Escribe tu ${que}.` };
  if (valor.length < 2 || valor.length > 40 || !LETRAS.test(valor)) return { error: `Escribe un ${que} válido (solo letras).` };
  return { valor };
}

export const revisarNombrePila = (texto) => revisarNombre(texto, 'nombre');
export const revisarApellido = (texto) => revisarNombre(texto, 'apellido');

// «V-12.345.678», «v12345678» o «12345678» → «V12345678». E para extranjeros; sin letra, V.
export function revisarCedula(texto) {
  const limpio = String(texto ?? '').toUpperCase().replace(/[\s.\-]/g, '');
  if (!limpio) return { error: 'Escribe tu cédula.' };
  const m = /^([VE])?(\d{6,9})$/.exec(limpio);
  if (!m || /^0+$/.test(m[2])) return { error: 'Escribe una cédula válida, por ejemplo V12345678.' };
  return { valor: `${m[1] || 'V'}${m[2].replace(/^0+/, '')}` };
}

// «0412 123 4567», «(0414)1234567» o «+58 424 1234567» → «0412-1234567».
export function revisarTelefono(texto) {
  let d = String(texto ?? '').replace(/[\s.()\-]/g, '');
  if (!d) return { error: 'Escribe tu número de celular.' };
  if (d.startsWith('+58')) d = `0${d.slice(3)}`;
  else if (d.startsWith('58') && d.length === 12) d = `0${d.slice(2)}`;
  else if (/^4\d{9}$/.test(d)) d = `0${d}`;
  if (!/^0\d{10}$/.test(d) || !PREFIJOS_CELULAR.includes(d.slice(0, 4))) {
    return { error: `Celular no válido: empieza por ${PREFIJOS_CELULAR.slice(0, -1).join(', ')} o ${PREFIJOS_CELULAR.at(-1)} y lleva 11 dígitos.` };
  }
  return { valor: `${d.slice(0, 4)}-${d.slice(4)}` };
}

// Todo junto: { datos } limpios o { errores: { campo: mensaje } }.
export function revisarCliente({ nombre, apellido, cedula, telefono }) {
  const r = { nombre: revisarNombrePila(nombre), apellido: revisarApellido(apellido), cedula: revisarCedula(cedula), telefono: revisarTelefono(telefono) };
  const errores = {};
  const datos = {};
  for (const [k, v] of Object.entries(r)) {
    if (v.error) errores[k] = v.error;
    else datos[k] = v.valor;
  }
  return Object.keys(errores).length ? { errores } : { datos };
}
