"use strict";

const bcrypt = require("bcryptjs");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function attachAuthRoutes(app) {
  app.post("/api/login", async (req, res, next) => {
    try {
      const username = String(req.body.username || "").trim();
      const password = String(req.body.password || "");
      if (!username || !password) {
        throw httpError(400, "Username dan password wajib diisi");
      }
      const user = await prisma.userSystem.findUnique({ where: { username } });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw httpError(401, "Username atau password salah");
      }
      req.session.user = { uid: user.uid, username: user.username };
      res.json({ ok: true, user: req.session.user });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/me", requireAuth, (req, res) => {
    res.json({ user: req.session.user });
  });
}

module.exports = { attachAuthRoutes };
