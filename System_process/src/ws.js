"use strict";

const { WebSocketServer } = require("ws");
const { hardwareGateway } = require("./hardwareGateway");
const { getStats } = require("./routes/dashboard");
const config = require("./config");

function dummyRes() {
  return {
    getHeader() {
      return undefined;
    },
    setHeader() {},
    end() {},
  };
}

function setupWebSockets(server, sessionParser) {
  const browserWss = new WebSocketServer({ noServer: true });
  const hardwareWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `http://${host}`);

    if (url.pathname === "/ws/hardware") {
      const token = url.searchParams.get("token") || "";
      if (token !== config.hardwareToken) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      hardwareWss.handleUpgrade(req, socket, head, (ws) => {
        hardwareWss.emit("connection", ws, req);
      });
      return;
    }

    if (url.pathname === "/ws") {
      sessionParser(req, dummyRes(), () => {
        if (!req.session || !req.session.user) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        browserWss.handleUpgrade(req, socket, head, (ws) => {
          browserWss.emit("connection", ws, req);
        });
      });
      return;
    }

    socket.destroy();
  });

  hardwareWss.on("connection", (ws) => {
    hardwareGateway.attach(ws);
  });

  browserWss.on("connection", (ws) => {
    ws.send(
      JSON.stringify({
        type: "hello",
        payload: { hardware: hardwareGateway.status() },
      })
    );
  });

  function broadcast(message) {
    const raw = JSON.stringify(message);
    for (const client of browserWss.clients) {
      if (client.readyState === 1) client.send(raw);
    }
  }

  hardwareGateway.on("status", (status) => {
    broadcast({ type: "hardware_status", payload: status });
  });

  hardwareGateway.on("enroll_progress", (payload) => {
    broadcast({ type: "enroll_progress", payload });
  });

  hardwareGateway.on("verify_result", async (log) => {
    let stats = null;
    try {
      stats = await getStats();
    } catch (_) {
      /* ignore */
    }
    broadcast({ type: "verify_result", payload: { log, stats } });
  });

  return { browserWss, hardwareWss, broadcast };
}

module.exports = { setupWebSockets };
