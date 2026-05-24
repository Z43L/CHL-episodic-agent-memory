# CHL Memory — Guía de Instalación

Esta guía instala CHL desde cero en cualquier máquina y lo configura para todos los agentes compatibles (Codex, Claude Code, OpenCode, OpenClaw, Hermes).

Sigue los pasos en orden. Al final tendrás memoria persistente compartida entre todos tus agentes.

---

## Paso 1: Requisitos

```bash
# Verifica que tienes:
node --version   # ≥ 24
clang++ --version # cualquier versión
git --version     # cualquiera
```

## Paso 2: Clonar e instalar

```bash
git clone https://github.com/tu-usuario/CHL-episodic-agent-memory.git ~/CHL-episodic-agent-memory
cd ~/CHL-episodic-agent-memory
npm install
```

## Paso 3: Compilar el motor nativo C++

```bash
npm run build:native
```

Verifica que el motor C++ carga:

```bash
node -e "const {NativeCHL}=require('./src/native'); const c=new NativeCHL({persistPath:null}); console.log('nativo:', !c.fallback)"
```

Debe imprimir `nativo: true`.

## Paso 4: Crear el archivo de persistencia

```bash
mkdir -p ~/.codex
touch ~/.codex/chl-memory.log
```

## Paso 5: Configurar MCP en cada agente

### Codex Desktop

Añade a `~/.codex/config.toml`:

```toml
[mcp_servers.chl-memory]
command = "node"
args = ["{HOME}/CHL-episodic-agent-memory/src/mcp-server.js"]
startup_timeout_sec = 90
enabled = true

[mcp_servers.chl-memory.env]
CHL_PERSIST_PATH = "{HOME}/.codex/chl-memory.log"
CHL_AUTO_REMEMBER = "smart"
```

> Sustituye `{HOME}` por la ruta absoluta de tu home (ej: `/Users/davidmoreno`).

Si usas el Node del runtime de Codex:

```toml
command = "{HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
```

### Claude Code

```bash
claude mcp add chl-memory --env CHL_PERSIST_PATH="{HOME}/.codex/chl-memory.log" --env CHL_AUTO_REMEMBER="smart" -- node {HOME}/CHL-episodic-agent-memory/src/mcp-server.js
```

O manualmente en `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "chl-memory": {
      "command": "node",
      "args": ["{HOME}/CHL-episodic-agent-memory/src/mcp-server.js"],
      "env": {
        "CHL_PERSIST_PATH": "{HOME}/.codex/chl-memory.log",
        "CHL_AUTO_REMEMBER": "smart"
      }
    }
  }
}
```

### OpenCode

En el archivo de configuración MCP de OpenCode:

```json
{
  "mcpServers": {
    "chl-memory": {
      "command": "node",
      "args": ["{HOME}/CHL-episodic-agent-memory/src/mcp-server.js"],
      "env": {
        "CHL_PERSIST_PATH": "{HOME}/.codex/chl-memory.log",
        "CHL_AUTO_REMEMBER": "smart"
      }
    }
  }
}
```

### OpenClaw / Hermes

Mismo formato JSON. Añadir al archivo `mcp.json` o equivalente del agente:

```json
{
  "mcpServers": {
    "chl-memory": {
      "command": "node",
      "args": ["{HOME}/CHL-episodic-agent-memory/src/mcp-server.js"],
      "env": {
        "CHL_PERSIST_PATH": "{HOME}/.codex/chl-memory.log",
        "CHL_AUTO_REMEMBER": "smart"
      }
    }
  }
}
```

## Paso 6: Instalar las reglas de auto-memory

```bash
cd ~/CHL-episodic-agent-memory
bash scripts/setup-agents.sh
```

Este script copia las reglas CHL a todos los agentes detectados. Las reglas le enseñan al agente a:
- Hacer `chl_recall` automáticamente antes de cada respuesta
- Guardar información valiosa con `chl_remember`
- Ingerir documentación de proyectos con `chl_ingest_directory`

## Paso 7: Verificar

Reinicia tu agente (Codex, Claude Code, etc.) y escribe:

```
chl_snapshot
```

Debe responder con:

```json
{
  "entryCount": 0,
  "autoRemember": { "enabled": true, "mode": "smart" }
}
```

Luego prueba la memoria:

```
chl_remember --input "Me llamo [tu nombre]" --payload '{"nombre":"[tu nombre]"}' --metadata '{"source":"test"}'
chl_recall --query "cómo me llamo"
```

## Paso 8 (opcional): Ingerir documentación de un proyecto

```
chl_ingest_directory --dirPath /ruta/a/tu/proyecto --maxFiles 200
```

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `dlopen` error | Recompila: `npm run build:native` |
| `CHL_PERSIST_PATH` apunta a carpeta | Debe ser un archivo `.log`, no una carpeta |
| MCP no arranca | Verifica `startup_timeout_sec = 90` |
| `fallback: true` | El addon C++ no compiló. Revisa `clang++` |
| Node version mismatch | Usa el Node del runtime de Codex o compila con `nvm use 24` |

---

## Archivos importantes después de instalar

```
~/.codex/chl-memory.log          ← memoria persistente (todos los agentes comparten este)
~/.codex/config.toml             ← config MCP de Codex
~/.codex/skills/chl-auto/        ← reglas auto-memory para Codex
~/.claude/CLAUDE.md              ← reglas auto-memory para Claude Code
~/.claude/mcp.json               ← config MCP de Claude Code
~/CHL-episodic-agent-memory/     ← código del proyecto
```
