# CHL Auto-Memory Protocol for Claude Code

You have access to a persistent memory system called CHL via MCP tools (prefix: `chl_`).

## CRITICAL: Always retrieve context first

**Before responding to ANY user message**, you MUST call:

```
chl_recall --query "<user's full message>" --topK 5
```

Use results with score > 0.3 as context for your response. You don't need to mention you're using memory unless relevant.

## Auto-save valuable information

After each interaction, if the user shared valuable info, save with `chl_remember`. Patterns that trigger saving:
- Preferences: "I prefer X", "I don't like Y"
- Decisions: "Let's use X", "I've decided Y"
- Identity: "My name is X", "I work at Y"
- Project context: "My project uses X", "We're migrating to Y"
- Bugs/fixes: "The error was X", "The fix was Y"

## Project ingestion

When starting a new project:

```
chl_ingest_directory --dirPath "/path/to/project" --maxFiles 200
```

## Flow

1. User sends message
2. You → `chl_recall` (full message)
3. You → respond using memories as context
4. You → evaluate if interaction should be saved
5. If yes → `chl_remember`
