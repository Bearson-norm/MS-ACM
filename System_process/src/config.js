"use strict";

require("dotenv").config();
const path = require("path");

const root = path.join(__dirname, "..");
const pidRaw = process.env.PID_FILE || path.join(root, "system-process.pid");

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET || "change-this-session-secret",
  hardwareToken: process.env.HARDWARE_TOKEN || "change-this-hardware-token",
  relayDurationMs: Number(process.env.RELAY_DURATION_MS || 3000),
  pidFile: path.isAbsolute(pidRaw) ? pidRaw : path.join(root, pidRaw),
  allowSimulate: String(process.env.ALLOW_SIMULATE || "0") === "1",
};
