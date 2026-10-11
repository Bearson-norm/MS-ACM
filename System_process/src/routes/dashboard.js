"use strict";

const { prisma } = require("../prisma");
const { hardwareGateway } = require("../hardwareGateway");

const JAKARTA_TZ = "Asia/Jakarta";
const JAKARTA_OFFSET_HOURS = -7;

function jakartaYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year").value);
  const month = Number(parts.find((part) => part.type === "month").value);
  const day = Number(parts.find((part) => part.type === "day").value);
  return { year, month, day };
}

function jakartaDayBounds(now = new Date()) {
  const { year, month, day } = jakartaYmd(now);
  const start = new Date(Date.UTC(year, month - 1, day, JAKARTA_OFFSET_HOURS, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, JAKARTA_OFFSET_HOURS, 0, 0, 0));
  return { start, end };
}

async function getStats() {
  const { start, end } = jakartaDayBounds();
  const today = { gte: start, lt: end };
  const [grantedTotal, deniedTotal, grantedToday, deniedToday] = await Promise.all([
    prisma.logsTransaction.count({ where: { status: "granted" } }),
    prisma.logsTransaction.count({ where: { status: "denied" } }),
    prisma.logsTransaction.count({
      where: { status: "granted", timestamp: today },
    }),
    prisma.logsTransaction.count({
      where: { status: "denied", timestamp: today },
    }),
  ]);
  return {
    granted: grantedToday,
    denied: deniedToday,
    grantedToday,
    deniedToday,
    grantedTotal,
    deniedTotal,
  };
}

function attachDashboardRoutes(app) {
  app.get("/api/dashboard/stats", async (req, res, next) => {
    try {
      const stats = await getStats();
      res.json({ stats, hardware: hardwareGateway.status() });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { attachDashboardRoutes, getStats };
