// Meta Pixel (ID 2979745935718136): el código que da Meta, en un archivo aparte porque la
// política de seguridad (CSP) de la tienda no deja correr scripts escritos dentro del HTML.
// app.js envía además ViewContent, AddToCart y el pedido (Purchase o Lead) con window.fbq.
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '2979745935718136');
fbq('track', 'PageView');
