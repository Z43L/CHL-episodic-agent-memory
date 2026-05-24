# CHL Memory — Regla Universal para Agentes

Esta regla se inyecta en el system prompt de cualquier agente (Codex, Claude Code, OpenCode, OpenClaw, Hermes, etc.) para que use CHL automáticamente.

## Cómo cargarla

Copia este archivo entero en el system prompt, rules file, o skill del agente:

- **Codex**: `~/.codex/skills/chl-auto/SKILL.md`
- **Claude Code**: `~/.claude/CLAUDE.md` o `/ruta/proyecto/CLAUDE.md`
- **OpenCode**: archivo de reglas del proyecto
- **OpenClaw**: config de system prompt
- **Hermes**: instructions file

---

# CHL Auto-Memory Protocol

Tienes acceso a un sistema de memoria persistente llamado CHL a través de herramientas MCP. Todas las herramientas tienen el prefijo `chl_`.

## Regla 1: Siempre recupera contexto primero

Antes de responder a CUALQUIER mensaje del usuario, ejecuta:

```
chl_recall --query "<el mensaje completo del usuario>" --topK 5
```

Si el resultado contiene memorias relevantes (score > 0.3), úsalas como contexto para tu respuesta. Menciona que las estás usando cuando aporten valor.

## Regla 2: Guarda automáticamente información valiosa

Después de cada interacción, evalúa si el usuario compartió:
- Preferencias personales ("prefiero X", "no me gusta Y")
- Decisiones ("vamos a usar X", "he decidido Y")
- Identidad ("me llamo X", "trabajo en Y")
- Contexto de proyecto ("mi proyecto usa X", "estamos migrando a Y")
- Bugs/errores ("el error era X", "la solución fue Y")

Si detectas cualquiera de estos patrones, guarda con:

```
chl_remember --input "<hecho>" --payload "<datos estructurados>" --metadata '{"source":"auto"}'
```

## Regla 3: Usa el pensamiento estructurado para decisiones complejas

Para decisiones de arquitectura, debugging complejo, o planificación:

```
chl_think --query "<problema>" --topK 8
```

Esto te dará una traza de pensamiento con evidencias de memoria, que podrás usar para razonar.

## Regla 4: Verifica antes de actuar

Para planes que modifiquen el sistema o decisiones irreversibles:

```
chl_plan --query "<objetivo>" --topK 6
chl_verify --plan "<plan generado>" --query "<objetivo>"
```

## Regla 5: Ingiere documentación de proyectos

Cuando entres en un proyecto nuevo, ingiere su documentación:

```
chl_ingest_directory --dirPath "/ruta/al/proyecto" --maxFiles 200
```

## Regla 6: Backup periódico

Cada 10-20 interacciones o antes de operaciones destructivas:

```
chl_backup_memory --backupPath "~/.codex/chl-backups/backup-$(date +%Y%m%d-%H%M%S).memory"
```

## Herramientas disponibles

| Herramienta | Usar cuando |
|------------|------------|
| `chl_recall` | Antes de cada respuesta — SIEMPRE |
| `chl_remember` | El usuario comparte info valiosa |
| `chl_infer` | Necesitas sintetizar una respuesta desde memoria |
| `chl_think` | Razonamiento complejo con evidencias |
| `chl_plan` + `chl_verify` | Planificación de acciones |
| `chl_ingest_file` | Cargar un archivo específico |
| `chl_ingest_directory` | Cargar documentación de proyecto |
| `chl_learn` | Corregir o reforzar asociaciones |
| `chl_auto_remember_status` | Verificar si auto-memoria está activo |
| `chl_snapshot` | Ver estado general de la memoria |
| `chl_backup_memory` | Exportar backup |
| `chl_restore_memory` | Importar backup |

## Prioridad de herramientas

1. `chl_recall` — siempre primero, antes de cualquier respuesta
2. `chl_remember` — inmediatamente después de recibir info valiosa
3. `chl_infer` / `chl_think` — cuando necesites razonar
4. El resto según necesidad
