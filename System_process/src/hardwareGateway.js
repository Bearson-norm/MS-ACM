"use strict";

const crypto = require("crypto");
const { EventEmitter } = require("events");
const config = require("./config");
const { prisma } = require("./prisma");

class HardwareGateway extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.busy = false;
    this.busyReason = null;
    this.pending = new Map();
  }

  get connected() {
    return Boolean(this.socket && this.socket.readyState === 1);
  }

  attach(ws) {
    if (this.socket && this.socket !== ws) {
      try {
        this.socket.close(4000, "replaced by new hardware connection");
      } catch (_) {
        /* ignore */
      }
    }
    this.socket = ws;
    this.busy = false;
    this.busyReason = null;
    this.emit("status", this.status());
    this.send({
      type: "config",
      payload: { relay_duration_ms: config.relayDurationMs },
    });

    ws.on("message", (raw) => this._onMessage(raw));
    ws.on("close", () => {
      if (this.socket === ws) {
        this.socket = null;
        this.busy = false;
        this.busyReason = null;
        this._rejectAll(new Error("Hardware disconnected"));
        this.emit("status", this.status());
      }
    });
    ws.on("error", () => {
      /* close handler will clean up */
    });
  }

  status() {
    return {
      connected: this.connected,
      busy: this.busy,
      busyReason: this.busyReason,
    };
  }

  send(message) {
    if (!this.connected) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  async handleVerifyRequest(msg) {
    const payload = msg.payload || {};
    const fingerprintId = Number(payload.fingerprint_id);
    const sensor = "access";
    const requestId = msg.request_id;

    let username = "unknown";
    let status = "denied";

    if (Number.isInteger(fingerprintId) && fingerprintId >= 0) {
      const user = await prisma.userMachine.findUnique({
        where: { fingerprintId },
      });
      if (user && user.isActive) {
        username = user.username;
        status = "granted";
      } else if (user) {
        username = user.username;
        status = "denied";
      }
    }

    const log = await prisma.logsTransaction.create({
      data: { username, status, sensor },
    });

    this.send({
      type: "verify_decision",
      request_id: requestId,
      payload: { status, username },
    });

    this.emit("verify_result", {
      uid: log.uid,
      username: log.username,
      timestamp: log.timestamp,
      status: log.status,
      sensor: log.sensor,
    });
    return log;
  }

  requestExclusive(type, payload, timeoutMs) {
    if (!this.connected) {
      return Promise.reject(Object.assign(new Error("Hardware tidak terhubung"), { code: "HW_OFFLINE" }));
    }
    if (this.busy) {
      return Promise.reject(Object.assign(new Error("Hardware sedang sibuk"), { code: "HW_BUSY" }));
    }

    const requestId = crypto.randomUUID();
    this.busy = true;
    this.busyReason = type;
    this.emit("status", this.status());

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this._clearBusy();
        reject(Object.assign(new Error("Timeout menunggu hardware"), { code: "HW_TIMEOUT" }));
      }, timeoutMs);

      this.pending.set(requestId, {
        type,
        resolve: (value) => {
          clearTimeout(timer);
          this._clearBusy();
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          this._clearBusy();
          reject(err);
        },
      });

      const sent = this.send({ type, request_id: requestId, payload: payload || {} });
      console.log(`[hw] send ${type} request_id=${requestId} sent=${sent}`);
      if (!sent) {
        this.pending.delete(requestId);
        clearTimeout(timer);
        this._clearBusy();
        reject(Object.assign(new Error("Hardware tidak terhubung"), { code: "HW_OFFLINE" }));
      }
    });
  }

  enroll(username) {
    // Hardware enroll: up to 45s + 15s + 45s finger waits (see as608.py) plus store.
    return this.requestExclusive("enroll_start", { username }, 180000);
  }

  deleteFingerprint(fingerprintId) {
    return this.requestExclusive("delete_user", { fingerprint_id: fingerprintId }, 20000);
  }

  _clearBusy() {
    this.busy = false;
    this.busyReason = null;
    this.emit("status", this.status());
  }

  _rejectAll(err) {
    for (const [, pending] of this.pending) {
      pending.reject(err);
    }
    this.pending.clear();
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }
    const type = msg.type;
    if (type === "verify_request") {
      this.handleVerifyRequest(msg).catch((err) => {
        console.error("verify_request failed", err);
        this.send({
          type: "verify_decision",
          request_id: msg.request_id,
          payload: { status: "denied", username: "unknown" },
        });
      });
      return;
    }
    if (type === "enroll_progress") {
      this.emit("enroll_progress", msg.payload || {});
      return;
    }
    if (type === "heartbeat") {
      this.emit("heartbeat", msg.payload || {});
      return;
    }
    if (type === "busy") {
      const pending = msg.request_id ? this.pending.get(msg.request_id) : null;
      if (pending) {
        this.pending.delete(msg.request_id);
        pending.reject(Object.assign(new Error("Hardware sibuk"), { code: "HW_BUSY" }));
      }
      return;
    }
    if (type === "enroll_result" || type === "delete_result") {
      const pending = msg.request_id ? this.pending.get(msg.request_id) : null;
      if (!pending) return;
      this.pending.delete(msg.request_id);
      const payload = msg.payload || {};
      if (payload.error || payload.ok === false) {
        pending.reject(
          Object.assign(new Error(payload.error || "Perintah hardware gagal"), {
            code: "HW_FAIL",
          })
        );
        return;
      }
      pending.resolve(payload);
    }
  }
}

const hardwareGateway = new HardwareGateway();

module.exports = { hardwareGateway, HardwareGateway };
