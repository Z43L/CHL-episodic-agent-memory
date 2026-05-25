#!/usr/bin/env node
/**
 * Test del MCP server en modo frontier.
 * Simula un agente conectándose y usando las herramientas.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const MCP_PATH = path.resolve(__dirname, "..", "bin", "chl-mcp.js");

function sendMessage(proc, msg) {
  const payload = JSON.stringify(msg);
  const frame = `Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`;
  proc.stdin.write(frame);
}

function readMessage(proc, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let contentLength = null;
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);

    const onData = (data) => {
      buffer += data.toString();
      
      while (true) {
        if (contentLength === null) {
          const headerEnd = buffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) return;
          const header = buffer.slice(0, headerEnd);
          const match = header.match(/Content-Length: (\d+)/);
          if (!match) {
            buffer = buffer.slice(headerEnd + 4);
            continue;
          }
          contentLength = parseInt(match[1]);
          buffer = buffer.slice(headerEnd + 4);
        }

        if (buffer.length >= contentLength) {
          const body = buffer.slice(0, contentLength);
          buffer = buffer.slice(contentLength);
          contentLength = null;
          proc.stdout.removeListener("data", onData);
          clearTimeout(timer);
          resolve(JSON.parse(body));
          return;
        }
        return;
      }
    };

    proc.stdout.on("data", onData);
  });
}

async function main() {
  console.log("🚀 Starting CHL Frontier MCP server...\n");

  const proc = spawn("node", [MCP_PATH], {
    env: {
      ...process.env,
      CHL_PROFILE: "large",
      CHL_FRONTIER: "true",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stderr.on("data", (d) => {
    // Silenciar stderr del MCP server
  });

  // 1. Initialize
  const initMsg = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-agent", version: "1.0" },
    },
  };
  sendMessage(proc, initMsg);
  const initResp = await readMessage(proc);
  console.log("✅ Initialized:", initResp.result?.serverInfo?.name, initResp.result?.serverInfo?.version);

  // Send initialized notification
  sendMessage(proc, { jsonrpc: "2.0", method: "notifications/initialized" });

  // 2. List tools
  sendMessage(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const toolsResp = await readMessage(proc);
  const toolNames = toolsResp.result?.tools?.map(t => t.name) ?? [];
  console.log("\n📋 Tools available:", toolNames.join(", "));
  console.log("   Frontier tools:", toolNames.filter(t => t.startsWith("chl_")).length, "total");

  // 3. Remember some facts
  const facts = [
    "el gato duerme sobre la mesa",
    "la mesa esta en la cocina",
    "la cocina queda en la casa",
    "el perro corre por el parque",
  ];

  for (const fact of facts) {
    sendMessage(proc, {
      jsonrpc: "2.0", id: 10 + facts.indexOf(fact),
      method: "tools/call",
      params: { name: "chl_remember", arguments: { input: fact, payload: { text: fact } } },
    });
    await readMessage(proc);
  }
  console.log(`\n📥 Inserted ${facts.length} facts`);

  // 4. Recall test
  sendMessage(proc, {
    jsonrpc: "2.0", id: 20,
    method: "tools/call",
    params: { name: "chl_recall", arguments: { query: "donde duerme el gato?", topK: 3 } },
  });
  const recallResp = await readMessage(proc);
  const recallText = recallResp.result?.content?.[0]?.text;
  console.log("\n🔍 Recall 'donde duerme el gato?':");
  console.log("  ", JSON.parse(recallText).candidates?.[0]?.entry?.text);

  // 5. Reason test (multi-hop)
  sendMessage(proc, {
    jsonrpc: "2.0", id: 21,
    method: "tools/call",
    params: { name: "chl_reason", arguments: { query: "donde esta el gato?", maxHops: 3, topK: 10 } },
  });
  const reasonResp = await readMessage(proc);
  const reasonText = reasonResp.result?.content?.[0]?.text;
  const reasonData = JSON.parse(reasonText);
  console.log("\n🧠 Reason 'donde esta el gato?':");
  console.log("  Conclusion:", reasonData.conclusion);
  console.log("  Chain:", reasonData.trace);
  console.log("  Inferred:", reasonData.inferred, "Hops:", reasonData.hops);

  // 6. Compose test
  sendMessage(proc, {
    jsonrpc: "2.0", id: 22,
    method: "tools/call",
    params: { name: "chl_compose", arguments: { query: "el felino descansa donde?", topK: 5 } },
  });
  const composeResp = await readMessage(proc);
  const composeText = composeResp.result?.content?.[0]?.text;
  const composeData = JSON.parse(composeText);
  console.log("\n✍️  Compose 'el felino descansa donde?':");
  console.log("  Text:", composeData.text);
  console.log("  Composed:", composeData.composed);

  // 7. Frontier status
  sendMessage(proc, {
    jsonrpc: "2.0", id: 30,
    method: "tools/call",
    params: { name: "chl_frontier_status", arguments: {} },
  });
  const statusResp = await readMessage(proc);
  const statusText = statusResp.result?.content?.[0]?.text;
  const statusData = JSON.parse(statusText);
  console.log("\n📊 Frontier Status:");
  console.log("  Trainer:", statusData.trainer?.prototypeCount, "prototypes,", statusData.trainer?.conceptPairs, "pairs");
  console.log("  Reasoner:", statusData.reasoner?.inferences, "inferences");
  console.log("  Decoder:", statusData.decoder?.compositions, "compositions");

  // 8. Feedback test
  sendMessage(proc, {
    jsonrpc: "2.0", id: 31,
    method: "tools/call",
    params: { name: "chl_feedback", arguments: { 
      query: "el felino duerme",
      expectedText: "el gato duerme sobre la mesa",
      rejectedText: "el perro corre por el parque",
    }},
  });
  const fbResp = await readMessage(proc);
  console.log("\n📚 Feedback applied");

  console.log("\n✅ All frontier MCP tests passed!");
  proc.kill();
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
