# CHL Memory Bridge

CHL es un motor de memoria episódica para agentes de IA con dos piezas:

1. **Motor CHL (C++ nativo)** — almacenamiento y recuperación vectorial en microsegundos
2. **Memory Bridge** — conecta la memoria CHL con modelos grandes (GPT-5, Claude, Ollama, etc.)

El resultado es un sistema **RAG episódico**: el agente recupera contexto de su memoria persistente a velocidad de C++ y luego razona sobre él con la inteligencia de un modelo grande.

## Por qué existe

Los agentes de IA pierden el contexto entre sesiones. CHL resuelve esto dándoles una memoria persistente, consultable y auto-mejorable que funciona a través de MCP — lo que significa que **todos tus agentes (Codex, Claude Code, OpenCode, OpenClaw, Hermes) comparten la misma memoria**.

## Arquitectura

```
Query → CHL Engine (C++, μs) → MemoryContext → LLM (GPT-5/Claude/Ollama)
         ↑_____________________ tool calls ___________________↓
```

| Capa | Qué hace | Dónde |
|------|---------|-------|
| Motor de memoria | Almacenamiento/recuperación vectorial | `native/chl_addon.cc` (C++) |
| Semantic navigation | Búsqueda multi-hop + variantes | `src/neural/chl-semantic-expert.js` |
| Memory context | Formateo de memorias para LLM | `src/bridge/memory-context.js` |
| Model adapter | Abstracción de proveedores LLM | `src/bridge/model-adapter.js` |
| Session | Historial multi-turno + tool loop | `src/bridge/session.js` |
| Bridge | Orchestrador principal | `src/bridge/bridge.js` |

## Proveedores soportados

- **OpenAI** — GPT-4, GPT-5, o3, o4-mini
- **Anthropic** — Claude Opus, Sonnet, Haiku
- **Ollama** — Modelos locales (llama3, mistral, qwen, etc.)
- **OpenRouter** — Proxy unificado a cientos de modelos
- **OpenAI-compatible** — vLLM, LiteLLM, LocalAI, etc.

## Uso rápido

### Modo MCP (recomendado para agentes)

Registra en `~/.codex/config.toml` (o equivalente en Claude Code, OpenCode, etc.):

```toml
[mcp_servers.chl-memory]
command = "node"
args = ["/ruta/a/CHL/src/mcp-server.js"]
startup_timeout_sec = 90

[mcp_servers.chl-memory.env]
CHL_PERSIST_PATH = "/ruta/a/CHL/chl-memory-data/chl-memory.log"
```

El agente tendrá acceso a todas las herramientas CHL: `chl_remember`, `chl_recall`, `chl_infer`, `chl_think`, `chl_plan`, `chl_learn`, etc.

### Modo Bridge (chat directo con modelo grande)

```bash
# Con OpenAI
npm run bridge:openai

# Con Anthropic
ANTHROPIC_API_KEY=sk-ant-... npm run bridge:anthropic

# Con Ollama (local)
npm run bridge:ollama
```

### Modo programático

```js
const { createBridge } = require('chl-extension');

const bridge = createBridge({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  persistPath: './mi-memoria.log',
});

const result = await bridge.turn('¿Qué decidimos sobre la arquitectura del proyecto?');
console.log(result.response);
// → "Según la memoria, decidiste usar microservicios con Redis como message broker..."
```

## Herramientas MCP

| Herramienta | Descripción |
|------------|-------------|
| `chl_remember` | Guarda un hecho, preferencia o contexto |
| `chl_recall` | Recupera memorias por similitud semántica |
| `chl_infer` | Sintetiza la mejor respuesta desde memoria |
| `chl_think` | Traza de pensamiento estructurada con evidencias |
| `chl_plan` | Plan paso a paso basado en memoria |
| `chl_verify` | Verifica un plan contra la memoria |
| `chl_learn` | Refuerza o suprime asociaciones |
| `chl_consolidate` | Consolida episodios en reglas |
| `chl_snapshot` | Vista compacta del estado actual |
| `chl_backup_memory` | Exporta la memoria completa |
| `chl_restore_memory` | Restaura desde backup |

## Instalación

```bash
npm install
npm run build:native
```

Requiere Node.js ≥ 24 y `clang++` para compilar el addon nativo.

## Estructura del proyecto

```
src/
├── native.js          # Binding C++ (NativeCHL)
├── chl.js             # Fallback JS del motor
├── bridge/            # Memory Bridge (nuevo)
│   ├── bridge.js      # Orchestrador
│   ├── session.js     # Sesiones multi-turno
│   ├── memory-context.js  # Formateo de contexto
│   └── model-adapter.js   # Proveedores LLM
├── neural/            # Capa de recuperación neuronal
│   ├── neural-chl.js  # API cognitiva (v3, delegada al bridge)
│   ├── chl-semantic-expert.js  # Navegación semántica multi-hop
│   ├── embeddings.js  # Indexación vectorial
│   ├── searcher.js    # Beam search sobre grafo
│   ├── verifier.js    # Verificación local
│   └── ...
├── mcp.js             # Servidor MCP (herramientas para agentes)
├── mcp-server.js      # Entry point del MCP
└── ...
```
