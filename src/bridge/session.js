/**
 * Session — Gestión de sesiones multi-turno con memoria CHL.
 *
 * Cada sesión mantiene:
 * - Historial de mensajes (user/assistant/tool)
 * - Referencia al motor CHL para recuperación previa a cada turno
 * - Presupuesto de tokens adaptable al hardware
 *
 * El ciclo de cada turno es:
 * 1. Recuperar contexto relevante de CHL (rápido, C++)
 * 2. Formatear contexto + historial para el LLM
 * 3. Llamar al LLM
 * 4. Procesar tool calls del LLM contra CHL
 * 5. Re-llamar al LLM con resultados de herramientas
 * 6. Devolver respuesta final
 */

const { buildMemoryContext, buildCompactMemoryContext } = require("./memory-context");
const { chooseAdaptiveConfig } = require("../neural/adaptive-context");

const MAX_HISTORY_MESSAGES = 40;
const MAX_TOOL_ROUNDS = 3;

class Session {
  /**
   * @param {Object} opts
   * @param {Object} opts.chl        - instancia de NativeCHL
   * @param {Object} opts.adapter    - ModelAdapter (OpenAI, Anthropic, etc.)
   * @param {Object} opts.systemPrompt - prompt de sistema base (sin memoria)
   * @param {number} opts.maxHistory - máximo de mensajes en historial
   */
  constructor(opts = {}) {
    this.chl = opts.chl;
    this.adapter = opts.adapter;
    this.baseSystemPrompt = opts.systemPrompt || "";
    this.maxHistory = opts.maxHistory || MAX_HISTORY_MESSAGES;
    this.messages = [];
    this.sessionId = `chl-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.stats = {
      turns: 0,
      totalTokens: 0,
      toolCalls: 0,
      memoriesRecalled: 0,
    };
  }

  /**
   * Procesa un turno completo: query → memoria → LLM → tool calls → respuesta.
   *
   * @param {string} userQuery
   * @returns {Object} { response, toolCalls, memoriesUsed, stats }
   */
  async turn(userQuery) {
    this.stats.turns++;
    const startTime = Date.now();

    // 1. Recuperar contexto de CHL
    const memoryContext = await this._retrieveContext(userQuery);

    // 2. Construir system prompt con memoria inyectada
    const systemMsg = this._buildSystemMessage(memoryContext, userQuery);

    // 3. Añadir mensaje del usuario al historial
    this.messages.push({ role: "user", content: userQuery });
    this._trimHistory();

    // 4. Llamar al LLM con herramientas CHL
    const fullMessages = [systemMsg, ...this.messages];
    let result = await this.adapter.chat(fullMessages);

    this.stats.totalTokens += (result.usage?.total_tokens || result.usage?.input_tokens || 0) +
      (result.usage?.output_tokens || result.usage?.completion_tokens || 0);

    // 5. Bucle de tool calls
    let toolRounds = 0;
    while (result.toolCalls && result.toolCalls.length > 0 && toolRounds < MAX_TOOL_ROUNDS) {
      toolRounds++;
      this.stats.toolCalls += result.toolCalls.length;

      // Añadir respuesta del assistant al historial
      this.messages.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: result.toolCalls,
      });

      // Ejecutar cada tool call contra CHL
      for (const tc of result.toolCalls) {
        const toolResult = await this._executeChlTool(tc.function.name, tc.function.arguments);
        this.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Re-llamar al LLM
      result = await this.adapter.chat([systemMsg, ...this.messages]);
      this.stats.totalTokens += (result.usage?.total_tokens || result.usage?.input_tokens || 0) +
        (result.usage?.output_tokens || result.usage?.completion_tokens || 0);
    }

    // 6. Guardar respuesta final en historial
    if (result.content) {
      this.messages.push({ role: "assistant", content: result.content });
    }
    this._trimHistory();

    const elapsed = Date.now() - startTime;

    return {
      response: result.content || "",
      toolCalls: result.toolCalls || [],
      memoriesUsed: memoryContext.memories?.length || 0,
      stats: { ...this.stats, lastTurnMs: elapsed },
    };
  }

  /**
   * Recupera contexto relevante de CHL para la query.
   * Normaliza los candidatos para que tengan la forma { entry: { id, text, score } }
   * que espera navigateSemanticMemory.
   */
  async _retrieveContext(query) {
    if (!this.chl) return { memories: [], concepts: [], graphEdges: [] };

    try {
      const { navigateSemanticMemory } = require("../neural/chl-semantic-expert");

      // Envolver candidatos de NativeCHL (que son { id, text, score })
      // en la forma { entry: { id, text, score } } que espera navigateSemanticMemory
      const recallFn = async (q, opts = {}) => {
        const result = this.chl.recall(q, { topK: opts.topK || 8 });
        const rawCandidates = result?.candidates || [];
        return {
          candidates: rawCandidates.map(c => ({
            entry: {
              id: c.id,
              text: c.text,
              score: c.score,
              payload: c.payload,
              metadata: c.metadata,
            },
            score: c.score,
          })),
        };
      };

      const navResult = await navigateSemanticMemory(query, recallFn, {
        perVariantTopK: 6,
        targetTopK: 10,
      });

      const memories = (navResult.reranked || []).map(r => ({
        entry: r.entry,
        score: r.score,
      }));
      this.stats.memoriesRecalled += memories.length;

      // Extraer conceptos del lexicon si está disponible
      let concepts = [];
      try {
        const lexicon = this.chl.lexicon?.() || this.chl.getLexicon?.() || {};
        concepts = Object.keys(lexicon || {}).slice(0, 20);
      } catch { /* sin lexicon */ }

      // Extraer grafo si está disponible
      let graphEdges = [];
      try {
        const graph = this.chl.conceptGraph?.() || this.chl.getGraph?.() || {};
        graphEdges = graph.edges || [];
      } catch { /* sin grafo */ }

      return { memories, concepts, graphEdges };
    } catch (err) {
      // Fallback: recall simple con envolvimiento
      try {
        const result = this.chl.recall(query, { topK: 8 });
        const rawCandidates = result?.candidates || [];
        const memories = rawCandidates.map(c => ({
          entry: {
            id: c.id,
            text: c.text,
            score: c.score,
            payload: c.payload,
          },
          score: c.score,
        }));
        this.stats.memoriesRecalled += memories.length;
        return { memories, concepts: [], graphEdges: [] };
      } catch {
        return { memories: [], concepts: [], graphEdges: [] };
      }
    }
  }

  /**
   * Construye el mensaje de sistema con memoria inyectada.
   */
  _buildSystemMessage(memoryContext, query = "") {
    const adaptive = chooseAdaptiveConfig({ lmBackend: "external" });
    const maxTokens = adaptive?.memoryBudget || 2000;

    const memBlock = memoryContext.memories?.length > 0
      ? buildMemoryContext({
          memories: memoryContext.memories,
          concepts: memoryContext.concepts,
          graphEdges: memoryContext.graphEdges,
          query,
          maxTokens,
        })
      : "";

    const systemContent = this.baseSystemPrompt
      ? `${this.baseSystemPrompt}\n\n${memBlock}`
      : memBlock;

    return {
      role: "system",
      content: systemContent || "Eres un asistente con acceso a memoria persistente CHL.",
    };
  }

  /**
   * Ejecuta una herramienta CHL llamada por el LLM.
   */
  async _executeChlTool(name, rawArgs) {
    if (!this.chl) return { error: "CHL engine no disponible" };

    let args;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return { error: `Argumentos inválidos: ${String(rawArgs).slice(0, 200)}` };
    }

    try {
      switch (name) {
        case "chl_remember": {
          this.chl.remember(args.input, args.payload, args.metadata);
          return { ok: true, action: "remembered" };
        }
        case "chl_recall": {
          const result = this.chl.recall(args.query, { topK: args.topK || 5 });
          const candidates = (result?.candidates || []).slice(0, args.topK || 5);
          return {
            ok: true,
            candidates: candidates.map(c => ({
              text: c.text || c.entry?.text || "",
              score: c.score || 0,
            })),
          };
        }
        case "chl_learn": {
          const reward = Math.max(-1, Math.min(1, args.reward || 0));
          this.chl.learn(args.input, reward);
          return { ok: true, action: reward > 0 ? "reinforced" : reward < 0 ? "suppressed" : "neutral" };
        }
        default:
          return { error: `Herramienta desconocida: ${name}` };
      }
    } catch (e) {
      return { error: e.message };
    }
  }

  /**
   * Recorta el historial para no exceder el límite.
   */
  _trimHistory() {
    while (this.messages.length > this.maxHistory) {
      this.messages.shift();
    }
  }

  /**
   * Limpia la sesión (sin borrar memoria CHL).
   */
  reset() {
    this.messages = [];
    this.stats = {
      turns: 0,
      totalTokens: 0,
      toolCalls: 0,
      memoriesRecalled: 0,
    };
  }

  /**
   * Exporta el estado de la sesión.
   */
  snapshot() {
    return {
      sessionId: this.sessionId,
      messageCount: this.messages.length,
      stats: this.stats,
    };
  }
}

module.exports = { Session };
