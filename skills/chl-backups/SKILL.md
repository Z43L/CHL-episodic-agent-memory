---
name: chl-backups
description: Use when exporting, restoring, clearing, or auditing CHL backups, binary archives, lexicon exports, and persistence artifacts.
---

# CHL Backups

Use this skill when the task touches backups, restore flows, or persistence checks.

## Export

- Use `chl_backup_memory` for the compact binary `.memory` archive written to a file path.
- Use `chl_lexicon_export` when you need TSV reuse data for concepts and phrases.

## Restore

- Use `chl_restore_memory` for `.memory` files.
- Default to `replace: true` for full archive restore unless the user explicitly wants to merge.

## Audit

Before and after a restore, inspect the smallest set of signals that proves integrity:

- `chl_snapshot`
- `chl_state`
- `chl_journal`
- `chl_bucket_stats`
- `chl_entries` if you need entry-level confirmation

## Cleanup

- Use `chl_clear` only when the user explicitly asks to wipe memory.
- If the request is ambiguous, confirm before deleting anything persistent.

## Resources

Prefer MCP resources for read-only inspection:

- `chl://backup.memory`
- `chl://lexicon.tsv`
- `chl://lexicon.concepts`
- `chl://lexicon.phrases`

## Guardrails

- Prefer `.memory` for portable backup exchange.
- Keep restore commands narrow and explicit.
- Treat binary restore as an integrity-sensitive operation.
