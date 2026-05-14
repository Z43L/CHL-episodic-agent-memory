const { stdin, stdout, stderr } = require("node:process");
const { createMcpContext, handleMcpMessage } = require("./mcp");

function writeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  stdout.write(payload);
}

function createFramedReader(onMessage) {
  let buffer = Buffer.alloc(0);

  stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const headerText = buffer.slice(0, headerEnd).toString("utf8");
      const match = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (buffer.length < bodyEnd) break;

      const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.slice(bodyEnd);

      try {
        const message = JSON.parse(body);
        onMessage(message);
      } catch (error) {
        stderr.write(`${error.message}\n`);
      }
    }
  });
}

function start() {
  const context = createMcpContext();
  createFramedReader((message) => {
    const response = handleMcpMessage(context, message);
    if (response && message.id !== undefined && message.id !== null) {
      writeMessage(response);
    }
  });
}

if (require.main === module) {
  start();
}

module.exports = { start };
