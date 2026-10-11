/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: "ms-acm-system",
      cwd: "./System_process",
      script: "src/index.js",
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
      cwd: "./Hardware-control",
      script: "src/main.py",
      interpreter: "./.venv/bin/python",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      watch: false,
    },
  ],
};
