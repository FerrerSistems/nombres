# 🔍 API DNI Perú - Búsqueda por Nombre

API REST para buscar DNI por nombres y apellidos usando dniperu.com.

## 🚀 Endpoints

### `GET /`
Estado de la API.

### `GET /api/buscar/:query`
Buscar usando path param con `+` como separador:
```
/api/buscar/alexander+bracho+ferrer
/api/buscar/juan+garcia
/api/buscar/maria+lopez+torres
```

### `GET /api/buscar?nombres=...&ap=...&am=...`
Buscar usando query string:
```
/api/buscar?nombres=alexander&ap=bracho&am=ferrer
/api/buscar?nombres=juan&ap=garcia
```

**Parámetros query string:**
| Param | Alias | Descripción |
|-------|-------|-------------|
| `nombres` | `nombre` | Nombres de la persona |
| `ap` | `apellido_paterno` | Apellido paterno |
| `am` | `apellido_materno` | Apellido materno |

## 📦 Respuesta de ejemplo

```json
{
  "estado": true,
  "mensaje": "Resultados encontrados",
  "total": 1,
  "resultados": [
    {
      "dni": "74941510",
      "nombres": "ALEXANDER ANDRES",
      "apellido_paterno": "BRACHO",
      "apellido_materno": "FERRER",
      "nombre_completo": "ALEXANDER ANDRES BRACHO FERRER"
    }
  ]
}
```

## 🛠️ Instalación local

```bash
npm install
npm start
```

## ☁️ Deploy en Render

Ver instrucciones en la sección de configuración de Render.
