# CHL Extension

CHL Extension is a local memory system built around the CHL engine. It gives an AI agent a persistent place to store facts, preferences, task context, and learned associations, then retrieve that information later through recall and inference.

The project is useful when you want the model to remember important context across turns or sessions without manually re-pasting everything every time. Instead of relying only on the chat window, CHL keeps structured memory that can be queried, reinforced, backed up, and restored.

## What It Is For

- remembering user preferences, decisions, and recurring project context
- recalling related memories when the model needs supporting information
- inferring the best answer from stored context instead of returning a raw list
- exporting and restoring memory state for portability and recovery
- inspecting learned lexicon data for debugging and reuse

## Why It Helps

- reduces repeated explanation and context loss
- makes recurring workflows faster and more consistent
- keeps important memory outside a single conversation
- provides backup and restore paths for safety
- exposes both an HTTP API and MCP tools, so it fits interactive and agent-driven workflows

## Example Workflow

1. Save an important fact, preference, or decision with `remember`.
2. Retrieve related context later with `recall`.
3. Use `infer` when you want the system to synthesize the best answer from memory.
4. Reinforce or correct behavior with `learn`.
5. Export a backup before major changes.
6. Restore the backup if you need to recover a previous state.

## What It Includes

- A native CHL-backed memory engine
- A local HTTP server for memory operations
- An MCP server for tool-based integrations
- Backup and restore utilities
- Lexicon inspection and TSV export

## Project Layout

- `src/` - core implementation
- `bin/` - CLI entrypoints
- `native/` - native addon source
- `scripts/` - build and evaluation scripts
- `test/` - automated tests
- `artifacts/` - benchmark and evaluation outputs

## Requirements

- Node.js compatible with the current project setup
- A working native build toolchain for compiling the addon

## Install

```bash
npm install
```

If you need to rebuild the native addon:

```bash
npm run build:native
```

## Run the HTTP Server

Start the local API server:

```bash
npm run serve
```

By default the server listens on `http://127.0.0.1:3030`.

### HTTP Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /profile`
- `GET /state`
- `GET /entries`
- `GET /journal`
- `GET /lexicon`
- `GET /lexicon.concepts.tsv`
- `GET /lexicon.phrases.tsv`
- `GET /lexicon.tsv`
- `GET /backup.memory`
- `POST /remember`
- `POST /recall`
- `POST /infer`
- `POST /learn`
- `POST /restore.memory`

### Example HTTP Usage

Store a memory:

```bash
curl -X POST http://127.0.0.1:3030/remember \
  -H "content-type: application/json" \
  -d '{
    "text": "El usuario prefiere respuestas en español",
    "metadata": {
      "source": "conversation",
      "topic": "language preference"
    }
  }'
```

Search for related memories:

```bash
curl -X POST http://127.0.0.1:3030/recall \
  -H "content-type: application/json" \
  -d '{
    "query": "preferencia de idioma",
    "topK": 5
  }'
```

Ask CHL to infer an answer:

```bash
curl -X POST http://127.0.0.1:3030/infer \
  -H "content-type: application/json" \
  -d '{
    "query": "Como debo responder al usuario?",
    "topK": 5
  }'
```

Export a backup:

```bash
curl -OJ http://127.0.0.1:3030/backup.memory
```

Restore a backup:

```bash
curl -X POST http://127.0.0.1:3030/restore.memory \
  --data-binary @backup.memory
```

## Run the MCP Server

Start the MCP transport server:

```bash
npm run serve:mcp
```

You can also use the CLI entrypoint:

```bash
chl-mcp
```

## MCP Tools

The MCP server exposes these tools:

- `chl_remember`
- `chl_recall`
- `chl_infer`
- `chl_learn`
- `chl_backup_memory`
- `chl_lexicon`
- `chl_lexicon_export`
- `chl_restore_memory`
- `chl_snapshot`
- `chl_profile`
- `chl_state`
- `chl_entries`
- `chl_journal`
- `chl_bucket_stats`
- `chl_clear`

It also exposes these read-only resources:

- `chl://memory`
- `chl://profile`
- `chl://state`
- `chl://entries`
- `chl://journal`
- `chl://backup.memory`
- `chl://lexicon`
- `chl://lexicon.concepts`
- `chl://lexicon.phrases`
- `chl://lexicon.tsv`

### Example MCP Usage

- Use `chl_remember` when the user shares a stable fact, preference, or decision.
- Use `chl_recall` when you need supporting context before answering.
- Use `chl_infer` when the right answer depends on several stored memories.
- Use `chl_learn` to reinforce a good pattern or correct a bad one.
- Use `chl_backup_memory` before risky edits or migrations.
- Use `chl_lexicon_export` when you want TSV output for reuse elsewhere.

## Environment Variables

- `CHL_PERSIST_PATH` - persistence path for memory state
- `PORT` - port for the HTTP server

## Testing

Run the test suite:

```bash
npm test
```

## Evaluation

There are benchmark and evaluation scripts available:

```bash
npm run eval
npm run bench
npm run bench:large
npm run bench:huge
```

## Notes

- The MCP server reads and writes memory through the native CHL implementation.
- Backup restore operations can replace or merge depending on the `replace` flag.
- Lexicon exports are available as TSV for reuse in other workflows.

## Typical Use Cases

- personal or project memory for an AI assistant
- remembering user-specific preferences across sessions
- storing decision history for long-running workflows
- retrieving related context before drafting an answer
- keeping a persistent backup of important conversational knowledge
