# CHL Auto-Memory Protocol for OpenClaw

## Always recall context

Call `chl_recall --query "<user message>" --topK 5` before every response.

## Auto-save important info

If the user shares preferences, decisions, identity, or project context, call `chl_remember`.

## Ingest documentation

Use `chl_ingest_directory` to load project docs into memory.
