"use strict";

const bcrypt = require("bcryptjs");
const { prisma } = require("../prisma");

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function publicUser(row) {
  return {
    uid: row.uid,
    username: row.username,
    createdAt: row.createdAt,
  };
}

function attachUserSystemRoutes(app) {
  app.get("/api/users/system", async (req, res, next) => {
    try {
      const rows = await prisma.userSystem.findMany({
        orderBy: { createdAt: "asc" },
      });
      res.json({ users: rows.map(publicUser) });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/users/system", async (req, res, next) => {
    try {
      const username = String(req.body.username || "").trim();
      const password = String(req.body.password || "");
      if (!username || !password) {
        throw httpError(400, "Username dan password wajib diisi");
      }
      if (password.length < 6) {
        throw httpError(400, "Password minimal 6 karakter");
      }
      const hash = await bcrypt.hash(password, 10);
      const user = await prisma.userSystem.create({
        data: { username, password: hash },
      });
      res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      if (err.code === "P2002") {
        err.status = 409;
        err.message = "Username sudah dipakai";
      }
      next(err);
    }
  });

  app.delete("/api/users/system/:uid", async (req, res, next) => {
    try {
      const user = await prisma.userSystem.findUnique({
        where: { uid: req.params.uid },
      });
      if (!user) throw httpError(404, "User tidak ditemukan");
      if (user.uid === req.session.user.uid) {
        throw httpError(400, "Tidak bisa menghapus akun yang sedang dipakai");
      }
      if (user.username === "admin") {
        throw httpError(400, "User admin default tidak boleh dihapus");
      }
      const remaining = await prisma.userSystem.count();
      if (remaining <= 1) {
        throw httpError(400, "Tidak boleh menghapus user sistem terakhir");
      }
      await prisma.userSystem.delete({ where: { uid: user.uid } });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { attachUserSystemRoutes };
