# Guía de Instalación en Codex / Claude Code / OpenCode

Esta guía deja `chl-memory` funcionando como servidor MCP en cualquier agente compatible (Codex Desktop, Claude Code CLI, OpenCode).

## 1) Requisitos

- Node.js `24.14.0` (o compatible).
- `clang++` disponible para compilar el addon nativo C++.

## 2) Preparar el proyecto

```bash
cd /ruta/a/CHL-episodic-agent-memory
npm install
```

## 3) Compilar el addon nativo C++

```bash
npm run build:native
```

Verifica:

```bash
node -e "const {NativeCHL}=require('./src/native'); const m=new NativeCHL({persistPath:null}); console.log('fallback?', !!m.fallback)"
```

Debe imprimir `fallback? false`.

## 4) Registrar MCP

### Codex Desktop

Configura `~/.codex/config.toml`:

```toml
[mcp_servers.chl-memory]
command = "node"
args = ["/RUTA/AL/REPO/src/mcp-server.js"]
startup_timeout_sec = 90

[mcp_servers.chl-memory.env]
CHL_PERSIST_PATH = "/RUTA/AL/REPO/chl-memory-data/chl-memory.log"
```

### Claude Code CLI

```bash
claude mcp add chl-memory -- node /RUTA/AL/REPO/src/mcp-server.js
```

### OpenCode

Añade al archivo de configuración MCP de OpenCode:

```json
{
  "mcpServers": {
    "chl-memory": {
      "command": "node",
      "args": ["/RUTA/AL/REPO/src/mcp-server.js"],
      "env": {
        "CHL_PERSIST_PATH": "/RUTA/AL/REPO/chl-memory-data/chl-memory.log"
      }
    }
  }
}
```

## 5) Memory Bridge (modelo grande)

Si quieres que CHL use un modelo grande para razonar sobre las memorias:

```bash
# OpenAI
OPENAI_API_KEY=sk-... node -e "
const {createBridge}=require('./src/bridge/bridge');
const b=createBridge({provider:'openai',persistPath:'./chl-memory-data/chl-memory.log'});
b.turn('hola, ¿qué recuerdas de mí?').then(r=>{console.log(r.response);b.close()});
"

# Ollama (local, gratuito)
node -e "
const {createBridge}=require('./src/bridge/bridge');
const b=createBridge({provider:'ollama',model:'llama3',persistPath:'./chl-memory-data/chl-memory.log'});
b.turn('hola').then(r=>{console.log(r.response);b.close()});
"
```

## 6) Validación

En una sesión de Codex/Claude Code:
- Llama `chl_snapshot` para ver el estado
- Usa `chl_remember "mi nombre es X"` para guardar
- Usa `chl_recall "nombre"` para recuperar

## 7) Troubleshooting

- **Error nativo (`dlopen` / firma):** recompila con `npm run build:native`
- **`CHL_PERSIST_PATH` apunta a carpeta:** debe ser un archivo `.log`
- **Arranque lento:** `startup_timeout_sec = 90`
- **Bridge no conecta:** verifica API key y conexión de red
