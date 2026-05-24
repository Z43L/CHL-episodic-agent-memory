# CHL Auto-Memory Protocol for OpenCode

You have access to CHL Memory via MCP tools (prefix: `chl_`).

## Rule 1: Always recall first

Before answering ANY query, call `chl_recall` with the user's message as query. Use topK=5. If results have score > 0.3, incorporate them into your response.

## Rule 2: Auto-save

After responding, if the user shared preferences, decisions, identity, bugs, or project context, save via `chl_remember`.

## Rule 3: Ingest projects

Use `chl_ingest_directory` to load project documentation into memory.

## Rule 4: Backup

Periodically backup with `chl_backup_memory`.
