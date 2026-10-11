const path = require("path");

const root = __dirname;
const hardwareDir = path.join(root, "Hardware-control");
const systemDir = path.join(root, "System_process");
const hardwarePython = path.join(hardwareDir, ".venv", "bin", "python");

/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: "ms-acm-system",
      cwd: systemDir,
      script: path.join(systemDir, "src", "index.js"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ms-acm-hardware",
      cwd: hardwareDir,
      script: path.join(hardwareDir, "src", "main.py"),
      interpreter: hardwarePython,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      watch: false,
    },
  ],
};
