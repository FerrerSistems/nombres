const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ─── Cache de sesión ──────────────────────────────────────────────────────────
let sesionCache = {
  security: null,
  cc_token: null,
  cc_sig: null,
  cookies: null,
  expira: 0
};

// ─── Obtener tokens reales desde el HTML ──────────────────────────────────────
async function obtenerTokens() {
  const ahora = Date.now();

  // Reusar caché si no ha expirado (10 minutos)
  if (sesionCache.security && ahora < sesionCache.expira) {
    return sesionCache;
  }

  console.log('🔄 Obteniendo nuevos tokens...');

  const headersNavegador = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  };

  try {
    const res = await fetch('https://dniperu.com/buscar-dni-por-nombre/', {
      method: 'GET',
      headers: headersNavegador,
      redirect: 'follow',
    });

    const rawCookies = res.headers.raw()['set-cookie'] || [];
    const cookies = rawCookies.map(c => c.split(';')[0]).join('; ');
    const html = await res.text();

    let security = null;
    const patronesSecurity = [
      /"security"\s*:\s*"([a-f0-9]{10})"/,
      /security['"]\s*:\s*['"]([\w]+)['"]/,
      /nonce['"]\s*:\s*['"]([\w]+)['"]/,
      /var\s+security\s*=\s*['"]([\w]+)['"]/,
    ];
    for (const patron of patronesSecurity) {
      const m = html.match(patron);
      if (m) { security = m[1]; break; }
    }

    let cc_token = null;
    const patronesToken = [
      /["']cc_token["']\s*:\s*["']([a-f0-9]+)["']/,
      /cc_token['"]\s*[=:]\s*['"]([\w]+)['"]/,
    ];
    for (const patron of patronesToken) {
      const m = html.match(patron);
      if (m) { cc_token = m[1]; break; }
    }

    let cc_sig = null;
    const patronesSig = [
      /["']cc_sig["']\s*:\s*["']([a-f0-9]+)["']/,
      /cc_sig['"]\s*[=:]\s*['"]([\w]+)['"]/,
    ];
    for (const patron of patronesSig) {
      const m = html.match(patron);
      if (m) { cc_sig = m[1]; break; }
    }

    console.log(`Tokens → security: ${security}, cc_token: ${cc_token ? 'OK' : 'null'}, cc_sig: ${cc_sig ? 'OK' : 'null'}`);

    if (security) {
      sesionCache = {
        security,
        cc_token: cc_token || '',
        cc_sig: cc_sig || '',
        cookies,
        expira: ahora + 10 * 60 * 1000
      };
      return sesionCache;
    }

    return null;

  } catch (e) {
    console.error('Error obteniendo tokens:', e.message);
    return null;
  }
}

// ─── Hacer la consulta al endpoint ───────────────────────────────────────────
async function consultarDNI(nombres, apellido_paterno, apellido_materno, tokens) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2, 18);

  const campos = [
    ['nombres', nombres],
    ['apellido_paterno', apellido_paterno],
    ['apellido_materno', apellido_materno],
    ['company', ''],
    ['action', 'buscar_dni'],
    ['security', tokens.security],
    ['cc_token', tokens.cc_token || ''],
    ['cc_sig', tokens.cc_sig || ''],
  ];

  let body = '';
  for (const [key, value] of campos) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;

  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': 'https://dniperu.com',
    'Referer': 'https://dniperu.com/buscar-dni-por-nombre/',
    'Accept': '*/*',
    'Accept-Language': 'es-PE,es;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (tokens.cookies) headers['Cookie'] = tokens.cookies;

  const response = await fetch('https://dniperu.com/wp-admin/admin-ajax.php', {
    method: 'POST',
    headers,
    body,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    console.error('Respuesta no JSON:', text.substring(0, 200));
    throw new Error('TOKENS_EXPIRADOS');
  }

  return await response.json();
}

// ─── Ruta principal ───────────────────────────────────────────────────────────
app.get(['/api/buscar', '/api/buscar/:query'], async (req, res) => {
  let nombres = '';
  let apellido_paterno = '';
  let apellido_materno = '';

  if (req.params.query) {
    const partes = req.params.query.trim().split(/[\+\s]+/);
    nombres = partes[0] || '';
    apellido_paterno = partes[1] || '';
    apellido_materno = partes[2] || '';
  } else {
    nombres = (req.query.nombres || req.query.nombre || '').trim();
    apellido_paterno = (req.query.ap || req.query.apellido_paterno || '').trim();
    apellido_materno = (req.query.am || req.query.apellido_materno || '').trim();
  }

  if (!nombres && !apellido_paterno) {
    return res.status(400).json({
      estado: false,
      mensaje: 'Debes enviar al menos nombres o apellido_paterno.',
      uso: [
        '/api/buscar/alexander+bracho+ferrer',
        '/api/buscar?nombres=alexander&ap=bracho&am=ferrer'
      ]
    });
  }

  try {
    let tokens = await obtenerTokens();

    if (!tokens) {
      return res.status(503).json({
        estado: false,
        mensaje: 'Cloudflare está bloqueando. Usa POST /api/tokens para inyectar tokens manualmente.'
      });
    }

    let data;
    try {
      data = await consultarDNI(nombres, apellido_paterno, apellido_materno, tokens);
    } catch (e) {
      if (e.message === 'TOKENS_EXPIRADOS') {
        console.log('🔁 Tokens expirados, renovando...');
        sesionCache.expira = 0;
        tokens = await obtenerTokens();
        if (!tokens) {
          return res.status(503).json({
            estado: false,
            mensaje: 'Tokens expirados. Usa POST /api/tokens para actualizarlos manualmente.'
          });
        }
        data = await consultarDNI(nombres, apellido_paterno, apellido_materno, tokens);
      } else {
        throw e;
      }
    }

    if (!data.success || !data.data?.resultados?.length) {
      return res.status(404).json({
        estado: false,
        mensaje: 'No se encontraron resultados.'
      });
    }

    return res.json({
      estado: true,
      mensaje: 'Resultados encontrados',
      total: data.data.resultados.length,
      resultados: data.data.resultados.map(r => ({
        dni: r.numero,
        nombres: r.nombres,
        apellido_paterno: r.apellido_paterno,
        apellido_materno: r.apellido_materno,
        nombre_completo: `${r.nombres} ${r.apellido_paterno} ${r.apellido_materno}`.trim()
      }))
    });

  } catch (e) {
    return res.status(500).json({ estado: false, mensaje: 'Error interno: ' + e.message });
  }
});

// ─── Inyectar tokens manualmente desde el navegador ──────────────────────────
// POST /api/tokens  body: { security, cc_token, cc_sig, cookies }
app.post('/api/tokens', (req, res) => {
  const { security, cc_token, cc_sig, cookies } = req.body;
  if (!security) return res.status(400).json({ estado: false, mensaje: 'Falta security' });

  sesionCache = {
    security,
    cc_token: cc_token || '',
    cc_sig: cc_sig || '',
    cookies: cookies || '',
    expira: Date.now() + 30 * 60 * 1000
  };

  console.log('✅ Tokens actualizados manualmente');
  res.json({ estado: true, mensaje: 'Tokens actualizados, válidos por 30 minutos.' });
});

// ─── Estado ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    estado: true,
    mensaje: 'API DNI Peru - Búsqueda por nombre activa',
    version: '2.0.0',
    tokens_activos: !!sesionCache.security,
    tokens_expiran: sesionCache.expira ? new Date(sesionCache.expira).toISOString() : null,
    uso: {
      buscar: '/api/buscar/alexander+bracho+ferrer',
      actualizar_tokens: 'POST /api/tokens { security, cc_token, cc_sig, cookies }'
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
