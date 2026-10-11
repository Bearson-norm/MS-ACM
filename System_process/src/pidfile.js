"use strict";

const fs = require("fs");
const path = require("path");

function acquirePid(pidFile) {
  const full = path.resolve(pidFile);
  if (fs.existsSync(full)) {
    const existing = Number(fs.readFileSync(full, "utf8").trim());
    if (existing && isPidAlive(existing)) {
      console.error(`System_process already running (pid ${existing}). Exiting.`);
      process.exit(1);
    }
  }
  fs.writeFileSync(full, String(process.pid));
  const release = () => {
    try {
      if (fs.existsSync(full) && fs.readFileSync(full, "utf8").trim() === String(process.pid)) {
        fs.unlinkSync(full);
      }
    } catch (_) {
      /* ignore */
    }
  };
  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    release();
    process.exit(0);
  });
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

module.exports = { acquirePid };
