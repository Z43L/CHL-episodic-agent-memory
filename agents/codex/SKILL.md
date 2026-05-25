# CHL Frontier Memory

## Setup

The CHL MCP server provides episodic memory with frontier capabilities:
- **99%+ recall** on real-world paraphrase queries
- **Multi-hop reasoning** without an LLM
- **Composition** that rephrases responses in the user's vocabulary

### MCP Configuration

Add to your agent's MCP config:

```json
{
  "mcpServers": {
    "chl-memory": {
      "command": "node",
      "args": ["bin/chl-mcp.js"],
      "env": {
        "CHL_PROFILE": "large",
        "CHL_CONCEPTS_PATH": "/path/to/artifacts/chl-concepts-bootstrap.tsv",
        "CHL_PHRASES_PATH": "/path/to/artifacts/chl-phrases.tsv",
        "CHL_FRONTIER": "true"
      }
    }
  }
}
```

### What CHL remembers automatically

When `CHL_FRONTIER=true`, the MCP server auto-loads:
- Bootstrap lexicon (226 concept pairs)
- Verb-preposition collocations (50 pairs)
- Any saved prototypes from `artifacts/concepts-prototypes.json`

### Tools available

| Tool | Purpose |
|---|---|
| `chl_remember` | Store a fact |
| `chl_recall` | Retrieve by semantic similarity |
| `chl_infer` | Recall + return best answer |
| `chl_reason` | Multi-hop inference across facts |
| `chl_compose` | Rephrase answer in user's vocabulary |
| `chl_feedback` | Train the system from corrections |
| `chl_frontier_status` | Show trainer/attention/decoder metrics |
| `chl_snapshot` | Memory size and profile |

### Usage pattern for agents

```
1. chl_recall(query)         → get candidates
2. chl_reason(query)          → multi-hop inference if needed  
3. chl_compose(query, result) → rephrase in user's terms
4. chl_feedback(correction)   → learn from mistakes
```
