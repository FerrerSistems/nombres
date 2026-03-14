const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ─── Tokens fijos (actualizar cuando expiren) ─────────────────────────────────
async function obtenerTokens() {
  return {
    security: '17d015a519',
    cc_token: 'd2111e1da3cbd2b62807faab1c32cfe9',
    cc_sig: '1b3329043b0c214be9506fa950fd2f029ead691fce99c2254fa909621b267f29',
    cookies: ''
  };
}

// ─── Ruta principal: buscar por nombre y/o apellidos ─────────────────────────
// Uso: /api/buscar?nombres=alexander&ap=bracho&am=ferrer
// También acepta: /api/buscar/alexander+bracho+ferrer
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

  const tokens = await obtenerTokens();

  try {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2, 18);

    const campos = [
      ['nombres', nombres],
      ['apellido_paterno', apellido_paterno],
      ['apellido_materno', apellido_materno],
      ['company', ''],
      ['action', 'buscar_dni'],
      ['security', tokens.security],
      ['cc_token', tokens.cc_token],
      ['cc_sig', tokens.cc_sig],
    ];

    let body = '';
    for (const [key, value] of campos) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
    }
    body += `--${boundary}--\r\n`;

    const response = await fetch('https://dniperu.com/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: {
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
      },
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
