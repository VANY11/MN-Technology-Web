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

  // Carrito: cómo se entrega y cómo se paga (opciones del formulario de pedido). Lista vacía = no se pregunta.
  pedidos: {
    entrega: ['Retiro en tienda', 'Envío a domicilio'],
    pago: ['Efectivo (USD)', 'Pago móvil', 'Transferencia', 'Zelle', 'Binance'],
    aviso: 'Te contactamos para confirmar disponibilidad, precio y forma de entrega antes de cobrar.',
  },

  // Burbuja de chat (abre WhatsApp). Solo aparece si hay número de WhatsApp.
  chat: {
    saludo: '¡Hola! ¿En qué te podemos ayudar?',
    sugerencias: ['¿Tienen disponible…?', '¿Qué formas de pago aceptan?', '¿Hacen envíos?', 'Quiero hablar con un asesor'],
  },

  // Decoración navideña (navidad.js + navidad.css). Se enciende sola entre «desde» y «hasta» (mes-día, cruza el año).
  // estilo: 'nieve', 'luces' o 'completa'; '' la apaga. Para probar sin esperar: añade ?navidad=nieve|luces|completa|no a la dirección.
  navidad: { estilo: 'completa', desde: '11-01', hasta: '01-06' },

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
