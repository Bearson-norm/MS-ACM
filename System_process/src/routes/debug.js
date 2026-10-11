"use strict";

const config = require("../config");
const { hardwareGateway } = require("../hardwareGateway");

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function attachDebugRoutes(app) {
  app.post("/api/debug/simulate-scan", (req, res, next) => {
    try {
      if (!config.allowSimulate) {
        throw httpError(404, "Not found");
      }
      if (!hardwareGateway.connected) {
        throw httpError(503, "Hardware tidak terhubung", "HW_OFFLINE");
      }
      const fingerprintId = Number(req.body.fingerprintId);
      if (!Number.isInteger(fingerprintId) || fingerprintId < -1) {
        throw httpError(400, "fingerprintId tidak valid");
      }
      hardwareGateway.send({
        type: "simulate_scan",
        payload: { sensor: "access", fingerprint_id: fingerprintId },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { attachDebugRoutes };
