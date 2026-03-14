const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

let sesion = { token: null, cookies: null, expira: 0 };

async function obtenerSesion() {
  const ahora = Date.now();
  if (sesion.token && ahora < sesion.expira) return sesion;

  try {
    console.log('🔄 Obteniendo sesión SUNAT...');
    const res = await fetch('https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp', {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9',
        'Connection':      'keep-alive',
      }
    });

    // Capturar cookies
    const rawCookies = res.headers.raw()['set-cookie'] || [];
    const cookies = rawCookies.map(c => c.split(';')[0]).join('; ');

    const html = await res.text();

    // Extraer token del formulario
    const match = html.match(/name=["']token["']\s+value=["']([^"']+)["']/i)
                || html.match(/value=["']([^"']+)["']\s+name=["']token["']/i)
                || html.match(/"token"\s*:\s*"([^"]+)"/);

    if (match) {
      sesion = { token: match[1], cookies, expira: ahora + 15 * 60 * 1000 };
      console.log('✅ Token:', match[1], '| Cookies:', cookies.substring(0, 50));
      return sesion;
    }

    console.error('❌ No se encontró token en el HTML');
    return null;
  } catch (e) {
    console.error('Error obteniendo sesión:', e.message);
    return null;
  }
}

// ─── Debug ────────────────────────────────────────────────────────────────────
app.get('/api/debug/:query', async (req, res) => {
  const razon = req.params.query.replace(/\+/g, ' ');
  sesion.expira = 0; // forzar renovación
  const s = await obtenerSesion();
  if (!s) return res.json({ error: 'No se pudo obtener sesión' });

  const body = new URLSearchParams({
    accion: 'consPorRazonSoc', razSoc: razon.toUpperCase(),
    nroRuc: '', nrodoc: '', token: s.token, contexto: 'ti-it',
    modo: '1', search1: '', tipdoc: '1', search2: '',
    rbtnTipo: '3', search3: razon.toUpperCase(), codigo: ''
  });

  const response = await fetch('https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/x-www-form-urlencoded',
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin':          'https://e-consultaruc.sunat.gob.pe',
      'Referer':         'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-PE,es;q=0.9',
      'Cookie':          s.cookies,
    },
    body: body.toString()
  });

  const html = await response.text();
  res.json({ token: s.token, cookies: s.cookies, html_preview: html.substring(0, 3000) });
});

// ─── Principal ────────────────────────────────────────────────────────────────
app.get(['/api/ruc', '/api/ruc/:query'], async (req, res) => {
  let razon = '';
  if (req.params.query) {
    razon = req.params.query.trim().replace(/\+/g, ' ');
  } else {
    razon = (req.query.q || req.query.razon || '').trim();
  }

  if (!razon) {
    return res.status(400).json({
      estado: false,
      mensaje: 'Debes enviar un nombre.',
      uso: ['/api/ruc/efrain+ureta+alvarez', '/api/ruc?q=efrain ureta alvarez']
    });
  }

  try {
    let s = await obtenerSesion();
    if (!s) return res.status(503).json({ estado: false, mensaje: 'No se pudo conectar con SUNAT.' });

    const body = new URLSearchParams({
      accion: 'consPorRazonSoc', razSoc: razon.toUpperCase(),
      nroRuc: '', nrodoc: '', token: s.token, contexto: 'ti-it',
      modo: '1', search1: '', tipdoc: '1', search2: '',
      rbtnTipo: '3', search3: razon.toUpperCase(), codigo: ''
    });

    const response = await fetch('https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/x-www-form-urlencoded',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin':          'https://e-consultaruc.sunat.gob.pe',
        'Referer':         'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9',
        'Cookie':          s.cookies,
      },
      body: body.toString()
    });

    const html = await response.text();

    // Si devuelve error de sesión, renovar y reintentar una vez
    if (html.includes('problemas al procesar')) {
      console.log('🔁 Sesión inválida, renovando...');
      sesion.expira = 0;
      s = await obtenerSesion();
      if (!s) return res.status(503).json({ estado: false, mensaje: 'No se pudo conectar con SUNAT.' });

      const body2 = new URLSearchParams({
        accion: 'consPorRazonSoc', razSoc: razon.toUpperCase(),
        nroRuc: '', nrodoc: '', token: s.token, contexto: 'ti-it',
        modo: '1', search1: '', tipdoc: '1', search2: '',
        rbtnTipo: '3', search3: razon.toUpperCase(), codigo: ''
      });

      const response2 = await fetch('https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias', {
        method: 'POST',
        headers: {
          'Content-Type':    'application/x-www-form-urlencoded',
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Origin':          'https://e-consultaruc.sunat.gob.pe',
          'Referer':         'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp',
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-PE,es;q=0.9',
          'Cookie':          s.cookies,
        },
        body: body2.toString()
      });

      return parsearYResponder(await response2.text(), res);
    }

    return parsearYResponder(html, res);

  } catch (e) {
    return res.status(500).json({ estado: false, mensaje: 'Error interno: ' + e.message });
  }
});

function parsearYResponder(html, res) {
  const resultados = [];
  const bloqueRegex = /<a[^>]+data-ruc="(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const stripHtml = s => s.replace(/<[^>]+>/g, '')
    .replace(/&oacute;/g,'ó').replace(/&aacute;/g,'á')
    .replace(/&eacute;/g,'é').replace(/&iacute;/g,'í')
    .replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ')
    .replace(/&amp;/g,'&').trim();

  let bloque;
  while ((bloque = bloqueRegex.exec(html)) !== null) {
    const ruc = bloque[1];
    const contenido = bloque[2];
    const h4s = [];
    const h4Pat = /<h4[^>]*>([\s\S]*?)<\/h4>/gi;
    let h4;
    while ((h4 = h4Pat.exec(contenido)) !== null) h4s.push(stripHtml(h4[1]));
    let ubicacion = '';
    const pMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(contenido);
    if (pMatch) ubicacion = stripHtml(pMatch[1]).replace(/^Ubicaci[oó]n:\s*/i, '');
    const dni = ruc.length === 11 ? ruc.slice(2, 10) : null;
    resultados.push({ ruc, dni, nombre_completo: h4s[1] || h4s[0] || '', ubicacion });
  }

  if (!resultados.length) {
    return res.status(404).json({ estado: false, mensaje: 'No se encontraron resultados.' });
  }
  return res.json({ estado: true, mensaje: 'Resultados encontrados', total: resultados.length, resultados });
}

app.get('/', (req, res) => {
  res.json({
    estado: true, mensaje: 'API SUNAT activa', version: '3.0.0',
    uso: { path_param: '/api/ruc/NOMBRES+APELLIDOS', query_string: '/api/ruc?q=efrain ureta alvarez' }
  });
});

app.use((req, res) => res.status(404).json({ estado: false, mensaje: 'Ruta no encontrada.' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor en puerto ${PORT}`));
