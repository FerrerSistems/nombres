const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ─── Obtener tokens dinámicos desde la página ───────────────────────────────
async function obtenerTokens() {
  try {
    const res = await fetch('https://dniperu.com/buscar-dni-por-nombre/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9',
      }
    });

    const html = await res.text();

    // Extraer security nonce (WordPress)
    const securityMatch = html.match(/"security"\s*:\s*"([a-f0-9]+)"/);
    const security = securityMatch ? securityMatch[1] : null;

    // Extraer cc_token
    const ccTokenMatch = html.match(/["']cc_token["']\s*:\s*["']([a-f0-9]+)["']/);
    const cc_token = ccTokenMatch ? ccTokenMatch[1] : null;

    // Extraer cc_sig
    const ccSigMatch = html.match(/["']cc_sig["']\s*:\s*["']([a-f0-9]+)["']/);
    const cc_sig = ccSigMatch ? ccSigMatch[1] : null;

    // Extraer cookies de la respuesta
    const cookies = (res.headers.raw()['set-cookie'] || [])
      .map(c => c.split(';')[0])
      .join('; ');

    return { security, cc_token, cc_sig, cookies };
  } catch (e) {
    console.error('Error obteniendo tokens:', e.message);
    return null;
  }
}

// ─── Ruta principal: buscar por nombre y/o apellidos ─────────────────────────
// Uso: /api/buscar?nombres=alexander&ap=bracho&am=ferrer
// También acepta: /api/buscar/alexander+bracho+ferrer  (con + o %20)
app.get(['/api/buscar', '/api/buscar/:query'], async (req, res) => {
  let nombres = '';
  let apellido_paterno = '';
  let apellido_materno = '';

  // Modo path param: /api/buscar/alexander+bracho+ferrer
  if (req.params.query) {
    const partes = req.params.query.trim().split(/[\+\s]+/);
    nombres = partes[0] || '';
    apellido_paterno = partes[1] || '';
    apellido_materno = partes[2] || '';
  } else {
    // Modo query string: ?nombres=alexander&ap=bracho&am=ferrer
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

  // Obtener tokens dinámicos
  const tokens = await obtenerTokens();
  if (!tokens || !tokens.security) {
    return res.status(503).json({
      estado: false,
      mensaje: 'No se pudieron obtener los tokens de sesión. Intenta de nuevo.'
    });
  }

  try {
    // Construir multipart form-data manualmente
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'Origin': 'https://dniperu.com',
      'Referer': 'https://dniperu.com/buscar-dni-por-nombre/',
      'Accept': '*/*',
      'Accept-Language': 'es-PE,es;q=0.9',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'X-Requested-With': 'XMLHttpRequest',
    };

    if (tokens.cookies) headers['Cookie'] = tokens.cookies;

    const response = await fetch('https://dniperu.com/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();

    if (!data.success || !data.data?.resultados?.length) {
      return res.status(404).json({
        estado: false,
        mensaje: 'No se encontraron resultados para los datos ingresados.'
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

// ─── Ruta de estado ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    estado: true,
    mensaje: 'API DNI Peru - Búsqueda por nombre activa',
    version: '1.0.0',
    uso: {
      path_param: '/api/buscar/NOMBRES+APELLIDO_PAT+APELLIDO_MAT',
      query_string: '/api/buscar?nombres=alexander&ap=bracho&am=ferrer',
      ejemplos: [
        '/api/buscar/alexander+bracho+ferrer',
        '/api/buscar/juan+garcia',
        '/api/buscar?nombres=maria&ap=lopez&am=torres'
      ]
    }
  });
});

// ─── 404 genérico ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ estado: false, mensaje: 'Ruta no encontrada.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
