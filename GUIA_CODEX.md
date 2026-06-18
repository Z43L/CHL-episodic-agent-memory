# CHL Memory — Instalación Global en Codex

CHL ya está instalado y configurado globalmente. Cada vez que abras Codex, el agente tendrá acceso a todas las herramientas de memoria.

## Configuración activa

```toml
# ~/.codex/config.toml

[mcp_servers.chl-memory]
command = "/Users/davidmoreno/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
args = ["/Users/davidmoreno/Desktop/CHL-episodic-agent-memory/src/mcp-server.js"]
startup_timeout_sec = 90
enabled = true

[mcp_servers.chl-memory.env]
CHL_PERSIST_PATH = "/Users/davidmoreno/.codex/chl-memory.log"
CHL_AUTO_REMEMBER = "smart"
```

- **Motor**: C++ nativo compilado para Node v24.14.0 (Codex runtime)
- **Persistencia**: `~/.codex/chl-memory.log`
- **Auto-memoria**: modo `smart` — guarda automáticamente preferencias, decisiones, bugs y contexto
- **28 herramientas** disponibles, todas con `approval_mode = "approve"` (sin confirmación)

## Herramientas disponibles

### Memoria core
| Herramienta | Qué hace |
|------------|---------|
| `chl_remember` | Guarda un hecho en memoria (clasificación automática de tipo) |
| `chl_remember_typed` | Guarda un hecho con tipo explícito y TTL opcional |
| `chl_recall` | Busca memorias relacionadas con intención y filtros de tipo |
| `chl_recall_by_type` | Busca memorias filtradas por uno o varios tipos |
| `chl_recall_personalized` | Busca priorizando perfil del usuario y personalidad de la IA |
| `chl_infer` | Sintetiza la mejor respuesta |
| `chl_think` | Traza de pensamiento con evidencias |
| `chl_plan` | Plan paso a paso |
| `chl_verify` | Verifica contra memoria |
| `chl_learn` | Refuerza/suprime asociaciones |
| `chl_consolidate` | Consolida episodios en reglas |

### Ingesta masiva
| Herramienta | Qué hace |
|------------|---------|
| `chl_ingest_file` | Ingiere PDF, MD, código, DOCX |
| `chl_ingest_directory` | Ingiere directorio recursivo |
| `chl_ingest_stats` | Stats previas sin ingestar |

### Auto-memoria
| Herramienta | Qué hace |
|------------|---------|
| `chl_auto_remember_status` | Estado del auto-memory |
| `chl_auto_remember_config` | Cambiar modo (all/smart/off) |

### Backup
| Herramienta | Qué hace |
|------------|---------|
| `chl_backup_memory` | Exporta a .memory |
| `chl_restore_memory` | Importa desde .memory |

### Inspección
| Herramienta | Qué hace |
|------------|---------|
| `chl_snapshot` | Vista rápida del estado |
| `chl_profile` | Perfil activo |
| `chl_state` | Volcado completo |
| `chl_graph` | Grafo de conceptos |
| `chl_entries` | Todas las entradas |
| `chl_journal` | Historial de mutaciones |
| `chl_episodes` | Episodios de decisión |
| `chl_lexicon` | Conceptos aprendidos |
| `chl_bucket_stats` | Estadísticas de buckets |
| `chl_clear` | Limpiar memoria |

## Uso de memorias tipadas

CHL distingue entre distintos tipos de memoria. Cuando guardas algo, el motor intenta clasificarlo automáticamente, pero puedes forzar el tipo con `chl_remember_typed`:

```json
// Perfil del usuario
{
  "input": "Me llamo David Moreno y trabajo en CHL",
  "memoryType": "user_profile",
  "source": "user"
}
```

```json
// Personalidad de la IA
{
  "input": "Responde siempre con tono profesional y conciso",
  "memoryType": "self_profile",
  "source": "user"
}
```

```json
// Conocimiento técnico
{
  "input": "Redis usa el puerto 6379 por defecto",
  "memoryType": "knowledge",
  "source": "docs"
}
```

```json
// Contexto que expira en 5 minutos
{
  "input": "Estamos depurando el servicio de pagos",
  "memoryType": "ephemeral",
  "ttlSeconds": 300
}
```

Para recuperar memoria de forma dirigida:

```json
// Perfil del usuario
{
  "query": "cómo me llamo",
  "memoryType": "user_profile"
}
```

```json
// Personalidad de la IA
{
  "query": "quién eres",
  "memoryType": "self_profile"
}
```

```json
// Búsqueda personalizada (prioriza perfil + personalidad)
{
  "query": "qué me gusta y cómo respondes",
  "topK": 5
}
```

El contexto que se envía al modelo grande se organiza en secciones por tipo, con el perfil del usuario y la personalidad de la IA en primer lugar.

## Para reinstalar en otra máquina

```bash
cd /ruta/a/CHL-episodic-agent-memory
npm install
npm run build:native
```

Luego añadir el bloque `[mcp_servers.chl-memory]` a `~/.codex/config.toml` con las rutas correctas.
