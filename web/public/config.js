// Textos y datos de la tienda que no vienen del inventario. Lo que quede vacío no se muestra.
export const STORE = {
  nombre: 'MN Technology',

  contacto: {
    // Número con código de país, solo dígitos (p. ej. '584121234567'). Activa los botones de WhatsApp.
    whatsapp: '',
    correo: '',
    instagram: '', // usuario sin @
    direccion: '',
    horario: '',
  },

  // Franja de la portada. Se pueden agregar, p. ej., envíos o garantía cuando apliquen.
  // {productos} y {categorias} se reemplazan por los números del catálogo.
  ventajas: [
    { icono: 'box', titulo: 'Stock real disponible', texto: 'Inventario sincronizado al minuto' },
    { icono: 'tag', titulo: 'Precios en 3 monedas', texto: 'Dólares, bolívares y pesos' },
    { icono: 'grid', titulo: '{productos} productos', texto: 'En {categorias} categorías' },
    { icono: 'chat', titulo: 'Atención directa', texto: 'Te asesoramos en tu compra' },
  ],

  // Página «Nosotros».
  nosotros: {
    etiqueta: 'MN Technology // Tecnología a tu alcance',
    titulo: ['Tecnología que', 'sí está disponible'],
    texto: 'Teléfonos, accesorios, audio, cámaras y más, con existencias reales y precios claros en dólares, bolívares y pesos.',
    pilares: [
      { nombre: 'Misión', texto: 'Acercar la tecnología a nuestros clientes con productos disponibles, precios claros y una atención cercana.' },
      { nombre: 'Visión', texto: 'Ser la tienda de tecnología de confianza de nuestra comunidad, en tienda y en línea.' },
      { nombre: 'Compromiso', texto: 'Mostrar solo lo que de verdad tenemos y responder cada consulta con rapidez.' },
    ],
  },
};
