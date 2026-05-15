const fs = require("node:fs");
const { NativeCHL } = require("./native");
const { resolveMemoryProfile } = require("./profiles");
const { serializePairList } = require("./concepts");

function createMcpContext(options = {}) {
  const memoryOptions = resolveMemoryProfile({
    ...(options.memory ?? {}),
    profile: options.profile ?? (options.memory ?? {}).profile,
    persistPath:
      (options.memory ?? {}).persistPath ??
      process.env.CHL_PERSIST_PATH ??
      null,
  });
  return {
    memory: new NativeCHL(memoryOptions),
    serverInfo: {
      name: "chl-memory",
      version: "0.1.0",
    },
  };
}

async function ensureMemoryReady(context) {
  if (context?.memory && typeof context.memory.whenReady === "function") {
    await context.memory.whenReady();
  }
}

function toolDefinitions() {
  return [
    {
      name: "chl_remember",
      description: "Store a memory entry in CHL.",
      inputSchema: {
        type: "object",
        properties: {
          input: {},
          payload: {},
          metadata: { type: "object" },
        },
        required: ["input"],
        additionalProperties: false,
      },
    },
    {
      name: "chl_recall",
      description: "Query CHL for the nearest matching memories.",
      inputSchema: {
        type: "object",
        properties: {
          query: {},
          topK: { type: "number", minimum: 1 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "chl_infer",
      description: "Infer the best answer from the nearest matching memories.",
      inputSchema: {
        type: "object",
        properties: {
          query: {},
          topK: { type: "number", minimum: 1 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "chl_learn",
      description: "Apply feedback to a memory or query string.",
      inputSchema: {
        type: "object",
        properties: {
          input: {},
          reward: { type: "number" },
        },
        required: ["input"],
        additionalProperties: false,
      },
    },
    {
      name: "chl_backup",
      description: "Export the full CHL memory backup as JSON for compatibility.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_backup_binary",
      description: "Export the full CHL memory backup as compressed binary encoded in base64.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_lexicon",
      description: "Inspect the current learned lexicon, including concepts and phrases.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_lexicon_export",
      description: "Export the current learned lexicon as TSV text for manual reuse.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_restore",
      description: "Restore CHL memory from a previously exported backup.",
      inputSchema: {
        type: "object",
        properties: {
          backup: { description: "Backup object or JSON string", oneOf: [{ type: "object" }, { type: "string" }] },
          backupPath: { type: "string" },
          replace: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
    },
    {
      name: "chl_restore_binary",
      description: "Restore CHL memory from a compressed binary backup.",
      inputSchema: {
        type: "object",
        properties: {
          backupBase64: { type: "string" },
          backupPath: { type: "string" },
          replace: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
    },
    {
      name: "chl_snapshot",
      description: "Inspect the current memory snapshot.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_profile",
      description: "Inspect the active memory profile.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_state",
      description: "Inspect the full current state, including entries, bucket stats and journal.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_entries",
      description: "Inspect every stored entry in full detail.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_journal",
      description: "Inspect the journal of mutations that drives persistence and restore.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_bucket_stats",
      description: "Inspect LSH bucket statistics.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "chl_clear",
      description: "Clear the memory and persisted journal.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  ];
}

function jsonContent(data) {
  return [
    {
      type: "text",
      text: JSON.stringify(data, null, 2),
    },
  ];
}

async function callTool(context, name, args = {}) {
  await ensureMemoryReady(context);
  const lexicon = () => context.memory.lexicon();
  const lexiconPayload = () => {
    const current = lexicon();
    return {
      concepts: current.concepts,
      phrases: current.phrases,
      counts: {
        concepts: current.concepts.length,
        phrases: current.phrases.length,
      },
      export: {
        conceptsTsv: serializePairList(current.concepts),
        phrasesTsv: serializePairList(current.phrases),
      },
    };
  };

  switch (name) {
    case "chl_remember":
      return { content: jsonContent(context.memory.remember(args.input, args.payload ?? null, args.metadata ?? {})) };
    case "chl_recall":
      return { content: jsonContent(context.memory.recall(args.query, { topK: args.topK ?? 5 })) };
    case "chl_infer":
      return { content: jsonContent(context.memory.infer(args.query, { topK: args.topK ?? 5 })) };
    case "chl_learn":
      context.memory.learn(args.input, args.reward ?? 0);
      return { content: jsonContent({ ok: true }) };
    case "chl_backup":
      return { content: jsonContent(context.memory.backup()) };
    case "chl_backup_binary":
      return {
        content: jsonContent({
          format: "chl-archive-bin-v1",
          encoding: "base64",
          data: context.memory.backupBinaryBase64(),
        }),
      };
    case "chl_lexicon":
      return { content: jsonContent(lexiconPayload()) };
    case "chl_lexicon_export":
      return {
        content: jsonContent({
          format: "chl-lexicon-tsv-v1",
          ...lexiconPayload(),
        }),
      };
    case "chl_restore": {
      let backup = args.backup;
      if (args.backupPath) {
        backup = fs.readFileSync(args.backupPath, "utf8");
      }
      const result = context.memory.restore(backup, { replace: args.replace ?? true });
      return { content: jsonContent(result) };
    }
    case "chl_restore_binary": {
      if (args.backupPath) {
        const result = context.memory.loadBackupBinary(args.backupPath, { replace: args.replace ?? true });
        return { content: jsonContent(result) };
      }
      const backupBase64 = args.backupBase64 ?? args.backup;
      if (typeof backupBase64 !== "string" || backupBase64.length === 0) {
        throw new Error("chl_restore_binary requires backupBase64 or backupPath");
      }
      const result = context.memory.restoreBinaryBase64(backupBase64, { replace: args.replace ?? true });
      return { content: jsonContent(result) };
    }
    case "chl_snapshot":
      return { content: jsonContent(context.memory.snapshot()) };
    case "chl_profile":
      return { content: jsonContent({ profile: context.memory.profile() }) };
    case "chl_state":
      return { content: jsonContent(context.memory.dumpState()) };
    case "chl_entries":
      return { content: jsonContent(context.memory.entries()) };
    case "chl_journal":
      return { content: jsonContent(context.memory.journal()) };
    case "chl_bucket_stats":
      return { content: jsonContent(context.memory.bucketStats()) };
    case "chl_clear":
      context.memory.clear();
      return { content: jsonContent({ ok: true }) };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function listTools() {
  return { tools: toolDefinitions() };
}

function listResources(context) {
  return {
    resources: [
      {
        uri: "chl://memory",
        mimeType: "application/json",
        name: "CHL Memory",
        description: "Full conversational memory state including snapshot, entries, journal and bucket stats.",
      },
      {
        uri: "chl://profile",
        mimeType: "application/json",
        name: "CHL Profile",
        description: "Active memory profile and tuning preset.",
      },
      {
        uri: "chl://state",
        mimeType: "application/json",
        name: "CHL State",
        description: "Current state including snapshot, bucket stats, entries and journal.",
      },
      {
        uri: "chl://entries",
        mimeType: "application/json",
        name: "CHL Entries",
        description: "All stored entries.",
      },
      {
        uri: "chl://journal",
        mimeType: "application/json",
        name: "CHL Journal",
        description: "Mutation journal used for persistence.",
      },
      {
        uri: "chl://backup",
        mimeType: "application/json",
        name: "CHL Backup",
        description: "Compatibility JSON backup archive.",
      },
      {
        uri: "chl://backup.bin",
        mimeType: "text/plain",
        name: "CHL Backup Binary",
        description: "Compressed binary backup encoded as base64.",
      },
      {
        uri: "chl://lexicon",
        mimeType: "application/json",
        name: "CHL Lexicon",
        description: "Current learned lexicon including concepts and phrases.",
      },
      {
        uri: "chl://lexicon.concepts",
        mimeType: "text/tab-separated-values",
        name: "CHL Lexicon Concepts",
        description: "Concept lexicon exported as TSV.",
      },
      {
        uri: "chl://lexicon.phrases",
        mimeType: "text/tab-separated-values",
        name: "CHL Lexicon Phrases",
        description: "Phrase lexicon exported as TSV.",
      },
      {
        uri: "chl://lexicon.tsv",
        mimeType: "text/tab-separated-values",
        name: "CHL Lexicon TSV",
        description: "Combined TSV export of concepts and phrases.",
      },
    ],
  };
}

async function readResource(context, uri) {
  await ensureMemoryReady(context);
  switch (uri) {
    case "chl://memory":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(context.memory.dumpState(), null, 2) }] };
    case "chl://profile":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ profile: context.memory.profile() }, null, 2) }] };
    case "chl://state":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(context.memory.dumpState(), null, 2) }] };
    case "chl://entries":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(context.memory.entries(), null, 2) }] };
    case "chl://journal":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(context.memory.journal(), null, 2) }] };
    case "chl://backup":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(context.memory.backup(), null, 2) }] };
    case "chl://backup.bin":
      return { contents: [{ uri, mimeType: "text/plain", text: context.memory.backupBinaryBase64() }] };
    case "chl://lexicon": {
      const current = context.memory.lexicon();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                concepts: current.concepts,
                phrases: current.phrases,
                counts: {
                  concepts: current.concepts.length,
                  phrases: current.phrases.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
    case "chl://lexicon.concepts":
      return { contents: [{ uri, mimeType: "text/tab-separated-values", text: serializePairList(context.memory.lexicon().concepts) }] };
    case "chl://lexicon.phrases":
      return { contents: [{ uri, mimeType: "text/tab-separated-values", text: serializePairList(context.memory.lexicon().phrases) }] };
    case "chl://lexicon.tsv": {
      const current = context.memory.lexicon();
      return {
        contents: [
          {
            uri,
            mimeType: "text/tab-separated-values",
            text: [
              "# concepts",
              serializePairList(current.concepts),
              "",
              "# phrases",
              serializePairList(current.phrases),
              "",
            ].join("\n"),
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

function handleMcpMessage(context, message) {
  if (!message || typeof message !== "object") return null;

  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
        },
        serverInfo: context.serverInfo,
      },
    };
  }

  if (message.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: listTools(),
    };
  }

  if (message.method === "resources/list") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: listResources(context),
    };
  }

  if (message.method === "resources/read") {
    return readResource(context, message.params?.uri).then((result) => ({
      jsonrpc: "2.0",
      id: message.id,
      result,
    }));
  }

  if (message.method === "tools/call") {
    return callTool(context, message.params?.name, message.params?.arguments ?? {}).then((result) => ({
      jsonrpc: "2.0",
      id: message.id,
      result,
    }));
  }

  if (message.method === "ping") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {},
    };
  }

  if (message.id !== undefined && message.id !== null) {
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32601,
        message: `Method not found: ${message.method}`,
      },
    };
  }

  return null;
}

module.exports = {
  callTool,
  createMcpContext,
  handleMcpMessage,
  listTools,
  listResources,
  readResource,
  ensureMemoryReady,
  toolDefinitions,
};
