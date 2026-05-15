---
name: chl-dynamic-retrieval
description: Use when the task is to dynamically recover, inspect, or synthesize information from the CHL Memory MCP by choosing the right tool or resource at runtime.
---

# CHL Dynamic Retrieval

Use this skill when you need to recover information from `chl-memory` without hard-coding a single tool path.

## Goal

Choose the narrowest CHL source that answers the request:

- exact read-only state: use MCP resources
- semantically related memories: use `chl_recall`
- synthesized answer from memory: use `chl_infer`
- debugging or auditing: use `chl_state`, `chl_entries`, `chl_journal`, or `chl_bucket_stats`

## Retrieval Strategy

1. Classify the request:
   - "What do we already know?" -> `chl_recall`
   - "What is the best answer?" -> `chl_infer`
   - "Show me the current data/state" -> resource read or snapshot tool
   - "Why is retrieval failing?" -> diagnostic tools
2. Start narrow:
   - keep queries short
   - begin with `topK: 3` or `topK: 5`
   - prefer one focused query over many broad ones
3. Refine only if needed:
   - broaden the query
   - raise `topK`
   - inspect the lexicon if the user is using domain-specific terms

## Tool Selection

- Use `chl_recall` when you want similar memories, supporting context, or candidates to inspect.
- Use `chl_infer` when the answer should be synthesized from retrieved memories.
- Use `chl_snapshot` for a compact current view.
- Use `chl_profile` when memory behavior depends on the active profile.
- Use `chl_lexicon` when terminology, concepts, or phrase mappings matter.
- Use `chl_state` for a full snapshot of the system.
- Use `chl_entries` when you need every stored entry.
- Use `chl_journal` when you need the mutation history.
- Use `chl_bucket_stats` when you suspect retrieval quality or indexing issues.

## Resource-First Reads

If you already know the exact data you need, prefer resources:

- `chl://memory`
- `chl://profile`
- `chl://state`
- `chl://entries`
- `chl://journal`
- `chl://lexicon`
- `chl://lexicon.concepts`
- `chl://lexicon.phrases`
- `chl://lexicon.tsv`

Use resource reads when the answer is mostly inspection rather than search.

## Dynamic Heuristics

- If the user names a specific memory or phrase, search with that wording first.
- If the user asks a broad question, start with `chl_infer`.
- If the first result set is noisy, inspect the lexicon and retry with more precise terms.
- If the request is about persistence, exports, or recovery, switch to backup tools instead of recall.

## Guardrails

- Do not call several broad tools in parallel unless the request truly needs comparison.
- Do not guess missing context when the MCP can supply it.
- Do not clear or overwrite memory unless the user explicitly asked for that.
