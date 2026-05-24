# CHL v2 Layered Architecture

CHL v2 is the path from local associative memory toward a deeper cognitive system. The goal is not to imitate a single monolithic LLM, but to stack specialized layers that understand, reason, write, verify, and learn from their own decisions.

This document defines the target architecture and the repo modules that already support each layer.

## Design Principle

Each layer should produce structured output, attach confidence, and preserve enough evidence for higher layers to challenge it. Higher layers do not erase lower layers; they reinterpret, score, verify, and send feedback back into memory.

The key loop is:

```text
input -> representation -> world model -> search -> generation -> verification -> consolidation -> memory
```

## Layer Stack

### 1. Statistical Token Layer

Purpose: convert raw text into reusable units that survive paraphrase, morphology, and domain vocabulary.

Current modules:

- `src/utils.js`
- `src/analysis.js`
- `src/concepts.js`

Target responsibilities:

- learned subwords, n-grams, phrase pairs, and concept aliases
- surprise, rarity, and frequency signals
- multilingual-safe normalization
- confidence for each extracted token or phrase

Next work:

- add token statistics by domain
- track token usefulness from verified answers
- promote stable phrase pairs into the lexicon automatically

### 2. Syntax And Semantic Layer

Purpose: turn text into entities, events, relations, negation, time, intent, and causal hints.

Current modules:

- `src/analysis.js`
- `src/graph.js`

Target responsibilities:

- "who did what to whom"
- relation typing such as `causes`, `uses`, `located_in`, `contradicts`, `enables`
- polarity and negation
- time and event ordering
- intent classification

Next work:

- add relation confidence
- add temporal extraction
- represent contradictions as first-class graph edges

### 3. World Model Layer

Purpose: maintain a compact, queryable model of facts, concepts, episodes, rules, and conflicts.

Current modules:

- `src/memory.js`
- `src/graph.js`
- `src/consolidation.js`

Target responsibilities:

- separate episodic, semantic, procedural, and rule memories
- merge repeated evidence into durable rules
- keep source, recency, quality, and confidence
- track contradictions instead of overwriting them silently

Next work:

- add explicit memory types
- add rule decay and reinforcement
- add conflict resolution policies

### 4. Thought Search Layer

Purpose: explore multiple interpretations instead of picking the nearest memory once.

Current module:

- `src/generation.js`
- `src/thought.js`

Target responsibilities:

- generate competing hypotheses
- expand evidence across graph neighbors
- perform multi-step search
- score route quality, contradiction risk, and evidence strength
- expose traceable reasoning paths

Next work:

- add beam search over hypotheses
- add contradiction-aware reranking
- add alternative plan generation

### 5. Planning Layer

Purpose: convert a thought trace into an action path.

Current module:

- `src/thought.js`

Target responsibilities:

- decide between `answer`, `clarify`, `plan`, `verify`, and `research`
- produce steps with dependencies
- estimate whether enough evidence exists
- preserve a plan trace for verification and learning

Next work:

- add multiple candidate plans
- rank plans by risk and expected information gain
- learn which plan shapes succeed by domain

### 6. Generation Layer

Purpose: turn structured thought into fluent, controllable language.

Current module:

- `src/thought.js`

Target responsibilities:

- direct answer generation
- explanation generation
- style control
- summarization
- translation through an interlingua-like semantic representation

Next work:

- add templates for answer types
- add style profiles
- add back-translation checks for translation quality

### 7. Verification Layer

Purpose: challenge generated output against memory, graph, plan, and internal consistency.

Current module:

- `src/thought.js`

Target responsibilities:

- detect unsupported claims
- detect contradictions
- check semantic fidelity
- calibrate confidence
- decide whether to answer or ask for clarification

Next work:

- add claim extraction from generated text
- verify each claim separately
- punish unsupported generation through feedback

### 8. Consolidation Layer

Purpose: learn from repeated decisions and verified outcomes.

Current modules:

- `src/consolidation.js`
- `src/chl.js`
- `src/native.js`

Current behavior:

- decision episodes are recorded
- repeated patterns become semantic rules
- auto-consolidation can run after N episodes
- low-confidence episodes can be filtered out
- consolidation state exposes cursor, pending work, runs, and errors

Next work:

- consolidate by topic and domain
- promote verified rules over unverified rules
- demote rules that later cause contradictions

## Control API

The public reasoning loop should be:

```text
think(query) -> plan(query) -> verify(plan) -> ask(query) -> consolidateEpisodes()
```

For higher quality generation, the next API should become:

```text
compose(query, options)
```

`compose` should return:

- final text
- cited evidence
- confidence
- claims
- verification checks
- memory updates
- decision episode

## Metrics To Beat LLMs On First

CHL should not try to beat general-purpose LLMs everywhere at once. It should first win on measurable axes where this architecture has natural leverage:

- long-term memory accuracy
- consistency over repeated sessions
- contradiction rate
- confidence calibration
- source traceability
- local latency and cost
- domain adaptation after feedback

Once those are strong, the generation layer can start competing on:

- answer fluency
- style control
- summarization fidelity
- translation fidelity
- open-ended reasoning with explicit traces

## Implementation Roadmap

Phase 1: stabilize current cognitive loop.

- keep `ask`, `think`, `plan`, `verify`, and `consolidateEpisodes` covered by tests
- expose consolidation defaults in profiles
- improve README and MCP docs

Phase 2: make memory types explicit.

- add `type: episodic | semantic | procedural | rule`
- add filtered recall by memory type
- make consolidation write semantic rules into a separate namespace

Phase 3: deepen thought search.

- implement beam search over hypotheses
- expand graph neighbors for each candidate route
- verify competing plans before choosing an answer

Phase 4: split generation from thought.

- deepen `src/generation.js`
- return claims and style metadata
- verify claims before returning final text

Phase 5: build an evaluation harness.

- compare CHL against LLM baselines on memory, consistency, contradiction, and cost
- store failing cases as training episodes
- use evaluation output to tune weights and consolidation policy
