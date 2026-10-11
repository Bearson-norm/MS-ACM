"use strict";

const { prisma } = require("../prisma");
const { hardwareGateway } = require("../hardwareGateway");

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function publicUser(row) {
  return {
    uid: row.uid,
    username: row.username,
    fingerprintId: row.fingerprintId,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

function attachUserMachineRoutes(app) {
  app.get("/api/users/machine", async (req, res, next) => {
    try {
      const rows = await prisma.userMachine.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.json({ users: rows.map(publicUser), hardware: hardwareGateway.status() });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/users/machine/enroll", async (req, res, next) => {
    try {
      const username = String(req.body.username || "").trim();
      if (!username) throw httpError(400, "Username wajib diisi");
      const existing = await prisma.userMachine.findUnique({ where: { username } });
      if (existing) throw httpError(409, "Username sudah dipakai");

      console.log(`[enroll] start user=${username} hw=${JSON.stringify(hardwareGateway.status())}`);
      const result = await hardwareGateway.enroll(username);
      console.log(`[enroll] hardware ok user=${username} fingerprint_id=${result.fingerprint_id}`);
      const fingerprintId = Number(result.fingerprint_id);
      const password = String(result.password_hash || "");
      if (!Number.isInteger(fingerprintId) || fingerprintId < 0 || !password) {
        throw httpError(502, "Respons enroll hardware tidak lengkap");
      }

      const user = await prisma.userMachine.create({
        data: {
          username,
          password,
          fingerprintId,
          isActive: true,
        },
      });
      res.status(201).json({ user: publicUser(user), passwordHash: password });
    } catch (err) {
      if (err.code === "HW_BUSY") err.status = 409;
      if (err.code === "HW_OFFLINE") err.status = 503;
      if (err.code === "HW_TIMEOUT" || err.code === "HW_FAIL") err.status = 504;
      next(err);
    }
  });

  app.patch("/api/users/machine/:uid/active", async (req, res, next) => {
    try {
      const isActive = Boolean(req.body.isActive);
      const user = await prisma.userMachine.update({
        where: { uid: req.params.uid },
        data: { isActive },
      });
      res.json({ user: publicUser(user) });
    } catch (err) {
      if (err.code === "P2025") err.status = 404;
      next(err);
    }
  });

  app.delete("/api/users/machine/:uid", async (req, res, next) => {
    try {
      const user = await prisma.userMachine.findUnique({
        where: { uid: req.params.uid },
      });
      if (!user) throw httpError(404, "User tidak ditemukan");

      await hardwareGateway.deleteFingerprint(user.fingerprintId);
      await prisma.userMachine.delete({ where: { uid: user.uid } });
      res.json({ ok: true });
    } catch (err) {
      if (err.code === "HW_BUSY") err.status = 409;
      if (err.code === "HW_OFFLINE") err.status = 503;
      if (err.code === "HW_TIMEOUT" || err.code === "HW_FAIL") err.status = 504;
      next(err);
    }
  });
}

module.exports = { attachUserMachineRoutes };
