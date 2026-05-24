/**
 * CHL Memory Bridge — Puente entre memoria CHL (C++, μs) y modelos grandes.
 *
 * Arquitectura:
 *   Query → CHL (C++ nativo) → MemoryContext → LLM (OpenAI/Claude/Ollama/...)
 *              ↑__________________ tool calls __________________↓
 *
 * El bridge orquesta el flujo completo:
 * 1. Recuperación ultra-rápida de CHL (motor C++)
 * 2. Formateo del contexto para el LLM (token-efficient)
 * 3. Invocación del LLM con herramientas CHL disponibles
 * 4. Ejecución de tool calls contra CHL (remember, recall, learn)
 * 5. Respuesta final con trazabilidad a memoria
 *
 * Proveedores soportados:
 * - openai (GPT-4, GPT-5, o3, o4-mini)
 * - anthropic (Claude Opus, Sonnet, Haiku)
 * - ollama (modelos locales: llama3, mistral, qwen, etc.)
 * - openrouter (proxy a cientos de modelos)
 * - openai-compat (vLLM, LiteLLM, LocalAI, etc.)
 */

const { NativeCHL } = require("../native");
const { createAdapter } = require("./model-adapter");
const { Session } = require("./session");

/**
 * Crea una instancia del Bridge completa.
 *
 * @param {Object} opts
 * @param {string} opts.provider      - "openai" | "anthropic" | "ollama" | "openrouter" | "openai-compat"
 * @param {string} opts.apiKey        - API key del proveedor
 * @param {string} opts.model         - nombre del modelo
 * @param {string} opts.baseURL       - URL base (para Ollama, compat, etc.)
 * @param {string} opts.persistPath   - ruta del archivo de persistencia CHL
 * @param {Object} opts.chlOptions    - opciones para NativeCHL
 * @param {string} opts.systemPrompt  - prompt de sistema base
 * @param {number} opts.maxTokens     - tokens máximos por generación
 * @returns {Object} { session, chl, adapter, turn }
 */
function createBridge(opts = {}) {
  const provider = opts.provider || "openai";

  // Motor CHL
  const chl = new NativeCHL({
    persistPath: opts.persistPath || process.env.CHL_PERSIST_PATH || null,
    ...(opts.chlOptions || {}),
  });

  // Adaptador de modelo
  const adapterOpts = {
    apiKey: opts.apiKey,
    model: opts.model,
    baseURL: opts.baseURL,
    maxTokens: opts.maxTokens || 4096,
    temperature: opts.temperature ?? 0.3,
  };

  const adapter = createAdapter(provider, adapterOpts);

  // Sesión
  const session = new Session({
    chl,
    adapter,
    systemPrompt: opts.systemPrompt || "",
    maxHistory: opts.maxHistory || 40,
  });

  return {
    chl,
    adapter,
    session,

    /**
     * Procesa un turno de conversación.
     * @param {string} query
     * @returns {Object} { response, memoriesUsed, toolCalls, stats }
     */
    async turn(query) {
      return session.turn(query);
    },

    /**
     * Inyecta contexto de CHL en un prompt para uso externo
     * (ej: cuando quieres pasar el contexto a Codex/Claude Code manualmente).
     *
     * @param {string} query
     * @param {number} maxTokens
     * @returns {string} contexto formateado
     */
    async injectContext(query, maxTokens = 2000) {
      const ctx = await session._retrieveContext(query);
      const { buildMemoryContext } = require("./memory-context");
      return buildMemoryContext({
        memories: ctx.memories,
        concepts: ctx.concepts,
        graphEdges: ctx.graphEdges,
        query,
        maxTokens,
      });
    },

    /**
     * Cierra el bridge y persiste la memoria.
     */
    async close() {
      if (typeof chl.close === "function") {
        await chl.close();
      }
    },

    /**
     * Snapshot del estado completo.
     */
    snapshot() {
      return {
        session: session.snapshot(),
        provider,
        model: adapter.model,
      };
    },
  };
}

/**
 * Versión express: una sola llamada sin mantener sesión.
 * Útil para integraciones donde no necesitas historial multi-turno.
 *
 * @param {string} query
 * @param {Object} opts - igual que createBridge
 * @returns {Object} { response, memoriesUsed }
 */
async function quickTurn(query, opts = {}) {
  const bridge = createBridge(opts);
  try {
    const result = await bridge.turn(query);
    return result;
  } finally {
    await bridge.close();
  }
}

module.exports = {
  createBridge,
  quickTurn,
  Session,
  createAdapter,
};
