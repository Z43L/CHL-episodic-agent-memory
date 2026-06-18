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
| `chl_remember` | Guarda un hecho, preferencia o contexto (con clasificación automática de tipo) |
| `chl_remember_typed` | Guarda una memoria con tipo explícito y TTL opcional |
| `chl_recall` | Recupera memorias por similitud semántica (con filtros de tipo e intención) |
| `chl_recall_by_type` | Recupera memorias filtradas por uno o varios tipos |
| `chl_recall_personalized` | Recupera memorias priorizando perfil del usuario y personalidad de la IA |
| `chl_infer` | Sintetiza la mejor respuesta desde memoria |
| `chl_think` | Traza de pensamiento estructurada con evidencias |
| `chl_plan` | Plan paso a paso basado en memoria |
| `chl_verify` | Verifica un plan contra la memoria |
| `chl_learn` | Refuerza o suprime asociaciones |
| `chl_consolidate` | Consolida episodios en reglas |
| `chl_snapshot` | Vista compacta del estado actual |
| `chl_backup_memory` | Exporta la memoria completa |
| `chl_restore_memory` | Restaura desde backup |

### Memoria tipada y scoring adaptativo

CHL clasifica automáticamente cada entrada en uno de los tipos de memoria:

- `ephemeral` — contexto temporal que expira rápidamente
- `short_term` — hechos recientes de la sesión actual
- `medium_term` — contexto de horas/días
- `long_term` — decisiones, preferencias estables, aprendizajes duraderos
- `user_profile` — nombre, preferencias e identidad del usuario
- `self_profile` — personalidad, instrucciones y rol de la IA
- `knowledge` — hechos del mundo, documentación, datos técnicos
- `episodic` — eventos concretos de la conversación o del proyecto

#### Guardar con tipo explícito

```json
{
  "input": "El usuario prefiere reuniones por la mañana",
  "memoryType": "user_profile",
  "source": "user"
}
```

También se puede forzar un TTL:

```json
{
  "input": "Token de acceso temporal",
  "memoryType": "ephemeral",
  "ttlSeconds": 300
}
```

#### Recuperar con intención y filtros

`chl_recall` detecta automáticamente la intención de la query y enruta hacia los tipos de memoria más relevantes. También permite forzar filtros:

```json
{
  "query": "quién eres",
  "intent": "self_reflection",
  "memoryType": "self_profile"
}
```

```json
{
  "query": "cómo me llamo",
  "intent": "user_recall",
  "memoryType": "user_profile"
}
```

Para búsquedas personales se usa `chl_recall_personalized`, que prioriza `user_profile` y `self_profile`:

```json
{
  "query": "qué me gusta y cómo respondes"
}
```

El contexto enviado al modelo grande se formatea en secciones etiquetadas por tipo, colocando primero el perfil del usuario y la personalidad de la IA.

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

---

## Inferencia del Modelo Fine-tuneado, Chat y Persistencia `.memory`

Hemos unificado la base de datos de memoria persistente C++ y el modelo neuronal fine-tuneado (Qwen 3B + LoRA + CHL Layer) para trabajar juntos de forma automática utilizando archivos de base de datos `.memory` (que reemplazan el formato antiguo `.log`).

### 1. Ingesta de Datasets desde Hugging Face

Puedes importar cualquier dataset de Hugging Face directamente dentro de un archivo de base de datos `.memory` usando el script unificado de ingesta:

```bash
# Ingerir las primeras 100 filas del dataset wikitext
npm run ingest:hf -- --dataset wikitext --config wikitext-2-raw-v1 --limit 100

# Ingerir un dataset personalizado indicando la columna de texto y el archivo .memory
npm run ingest:hf -- --dataset username/dataset-name --text-column content --memory mis-datos.memory --limit 500
```

*Nota: Todas las demás columnas del dataset se guardan automáticamente dentro de los metadatos y payload de cada memoria para preservar el contexto original.*

### 2. Chat Interactivo Unificado

El comando `chat:unified` lanza una consola de chat que conecta la base de datos `.memory` local con la inferencia de tu modelo neuronal fine-tuneado:

```bash
# Usando la memoria por defecto (chl-memory.memory)
npm run chat:unified

# Usando una memoria específica
npm run chat:unified -- --memory ./mis-datos.memory
```

* **Autodetección del Backend:** El script detecta automáticamente si el servidor del modelo en Python (`serve_model.py`) está activo. Si no, lo levanta automáticamente en segundo plano en el puerto `3040` y espera a que responda antes de iniciar.
* **Comandos en Chat:**
  - `/remember <hecho>` — Guarda un hecho en tiempo real en el archivo `.memory`.
  - `/recall <consulta>` — Busca similitudes en la base de datos.
  - `/state` — Imprime el número de memorias y estadísticas.
  - `/clear` — Limpia el contexto de la conversación.
  - `/exit` — Cierra la sesión de forma limpia.

### 3. Servidor de API Gateway Compatible con OpenAI

Puedes exponer tu base de datos `.memory` y el modelo neuronal a través de un endpoint compatible con la API de OpenAI (completions de chat) para conectarlo a herramientas externas (como Codex o Claude Code):

```bash
# Servir en el puerto 3050 usando una memoria específica
npm run chat:unified -- --serve --port 3050 --memory ./produccion.memory
```

---

## Instalación rápida

```bash
git clone <repo> ~/CHL-episodic-agent-memory
cd ~/CHL-episodic-agent-memory
bash scripts/install.sh
```

Guía detallada: [INSTALL.md](/Users/davidmoreno/Desktop/CHL-episodic-agent-memory/INSTALL.md)

