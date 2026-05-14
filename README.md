# CHL Extension

CHL Extension is a local memory system with a Node.js API and an MCP server. It stores conversational memory, supports recall and inference, and exposes export/restore flows for backups and lexicon data.

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
- `GET /backup`
- `GET /backup.bin`
- `POST /remember`
- `POST /recall`
- `POST /infer`
- `POST /learn`
- `POST /restore`
- `POST /restore.bin`

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
- `chl_backup`
- `chl_backup_binary`
- `chl_lexicon`
- `chl_lexicon_export`
- `chl_restore`
- `chl_restore_binary`
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
- `chl://backup`
- `chl://backup.bin`
- `chl://lexicon`
- `chl://lexicon.concepts`
- `chl://lexicon.phrases`
- `chl://lexicon.tsv`

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
