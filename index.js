const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ─── Obtener token dinámico desde la página de SUNAT ─────────────────────────
let tokenCache = { value: null, expira: 0 };

async function obtenerToken() {
  const ahora = Date.now();
  if (tokenCache.value && ahora < tokenCache.expira) return tokenCache.value;

  try {
    const res = await fetch('https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9',
      }
    });

    const html = await res.text();
    const match = html.match(/name="token"\s+value="([^"]+)"/);
    if (match) {
      tokenCache = { value: match[1], expira: ahora + 20 * 60 * 1000 };
      console.log('Token obtenido:', match[1]);
      return match[1];
    }
  } catch (e) {
    console.error('Error obteniendo token:', e.message);
  }

  // Fallback al token conocido
  return 'vjnescsa6cooxlp5g4sgcld1adhbe2ku1vr73v8mo9qteyl4zez9';
}

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
      uso: ['/api/ruc/efrain+luis+ureta+alvarez', '/api/ruc?q=efrain luis ureta alvarez']
    });
  }

  try {
    const token = await obtenerToken();

    const body = new URLSearchParams({
      accion:   'consPorRazonSoc',
      razSoc:   razon.toUpperCase(),
      nroRuc:   '',
      nrodoc:   '',
      token,
      contexto: 'ti-it',
      modo:     '1',
      search1:  '',
      tipdoc:   '1',
      search2:  '',
      rbtnTipo: '3',
      search3:  razon.toUpperCase(),
      codigo:   ''
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
      },
      body: body.toString()
    });

    const html = await response.text();
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
      const nombre = h4s[1] || h4s[0] || '';

      resultados.push({ ruc, dni, nombre_completo: nombre, ubicacion });
    }

    if (!resultados.length) {
      return res.status(404).json({ estado: false, mensaje: 'No se encontraron resultados.' });
    }

    return res.json({ estado: true, mensaje: 'Resultados encontrados', total: resultados.length, resultados });

  } catch (e) {
    return res.status(500).json({ estado: false, mensaje: 'Error interno: ' + e.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    estado: true,
    mensaje: 'API SUNAT - Búsqueda por nombre activa',
    version: '2.0.0',
    uso: {
      path_param:   '/api/ruc/NOMBRES+APELLIDOS',
      query_string: '/api/ruc?q=efrain luis ureta alvarez',
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ estado: false, mensaje: 'Ruta no encontrada.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
