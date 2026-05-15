# Guia de Instalacion y Configuracion en Codex

Esta guia deja `chl-memory` funcionando como servidor MCP en Codex con motor nativo C++.

## 1) Requisitos

- Node.js `24.14.0` (o compatible con el proyecto).
- `clang++` disponible.
- Codex Desktop instalado.

## 2) Preparar el proyecto

Desde la raiz del repo:

```bash
npm install
```

## 3) Compilar el addon nativo C++

Si tu runtime de Node no incluye headers, descarga los headers oficiales:

```bash
mkdir -p .cache-node-headers
curl -fL https://nodejs.org/dist/v24.14.0/node-v24.14.0-headers.tar.gz -o .cache-node-headers/node-headers.tar.gz
tar -xzf .cache-node-headers/node-headers.tar.gz -C .cache-node-headers
```

Compila el addon:

```bash
NODE_INCLUDE_DIR="$PWD/.cache-node-headers/node-v24.14.0/include/node" node scripts/build-native.js
```

Verifica carga nativa:

```bash
node -e "const {NativeCHL}=require('./src/native'); const m=new NativeCHL({persistPath:null}); console.log('fallback?', !!m.fallback)"
```

Debe imprimir `fallback? false`.

## 4) Registrar MCP en Codex

Configura `~/.codex/config.toml`:

```toml
[mcp_servers.chl-memory]
command = "/Users/TU_USUARIO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
args = ["/RUTA/AL/REPO/src/mcp-server.js"]
startup_timeout_sec = 90

[mcp_servers.chl-memory.env]
CHL_PERSIST_PATH = "/RUTA/AL/REPO/chl-memory-data/chl-memory.log"
```

Importante:
- `CHL_PERSIST_PATH` debe ser un **archivo** (`.../chl-memory.log`), no una carpeta.

## 5) Reiniciar Codex

- Cierra y abre Codex Desktop para recargar MCP servers.

## 6) Validacion rapida

En una sesion nueva de Codex:
- Comprueba que no aparezca `MCP startup incomplete (failed: chl-memory)`.
- Llama una herramienta MCP de CHL (por ejemplo `chl_snapshot`).

## 7) Troubleshooting

- Error de handshake (`connection closed: initialize response`):
  - Asegurate de usar este repo con la version actual de `src/mcp-server.js` y `src/mcp.js`.
- Error nativo (`dlopen` / firma / Team ID):
  - Recompila el addon con Node `24.14.0` y headers oficiales.
- Error `EISDIR`:
  - `CHL_PERSIST_PATH` apunta a carpeta; cambia a archivo `.../chl-memory.log`.
- Arranque lento:
  - Mantener `startup_timeout_sec = 90`.

