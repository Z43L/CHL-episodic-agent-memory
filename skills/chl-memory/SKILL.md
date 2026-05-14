---
name: chl-memory
description: Use when working with the CHL MCP for everyday memory tasks: remember, recall, infer, learn, inspect lexicon, or inspect state/resources.
---

# CHL Memory

Use this skill when the task is about storing, retrieving, or reasoning over CHL memory.

## Default flow

1. Use `chl_remember` when the user gives new facts, decisions, preferences, or task context that should persist.
2. Use `chl_recall` when the user wants related memories, similar past items, or supporting context.
3. Use `chl_infer` when the user wants the best answer synthesized from stored memories instead of a raw list.
4. Use `chl_learn` when the user corrects, reinforces, or weakens an association.

## Tool choice

- Keep `chl_recall` queries short and specific.
- Use `topK` only as high as needed.
- Put structured data in `payload` and lightweight provenance in `metadata`.
- Use positive `reward` to reinforce, negative `reward` to suppress, and `0` for neutral feedback.

## Inspect when needed

Prefer the lightest inspection that answers the question:

- `chl_snapshot` for a compact current view.
- `chl_profile` for the active tuning preset.
- `chl_lexicon` for learned concepts and phrases.
- `chl_state` for a full diagnostic dump.
- `chl_entries` when you need every stored entry.
- `chl_journal` when you need mutation history.
- `chl_bucket_stats` when debugging retrieval behavior.

## Resources

Use MCP resources directly when a read-only view is enough:

- `chl://memory`
- `chl://profile`
- `chl://state`
- `chl://entries`
- `chl://journal`
- `chl://lexicon`

## Guardrails

- Do not clear memory unless the user explicitly asks for a reset.
- Do not invent memory structure; mirror the user’s content and the MCP schema.
- Prefer one focused tool call over several broad ones.
