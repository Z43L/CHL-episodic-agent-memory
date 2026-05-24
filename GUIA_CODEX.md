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
| `chl_remember` | Guarda un hecho en memoria |
| `chl_recall` | Busca memorias relacionadas |
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

## Para reinstalar en otra máquina

```bash
cd /ruta/a/CHL-episodic-agent-memory
npm install
npm run build:native
```

Luego añadir el bloque `[mcp_servers.chl-memory]` a `~/.codex/config.toml` con las rutas correctas.
