"use strict";

const PDFDocument = require("pdfkit");
const { prisma } = require("../prisma");

const PAGE_SIZE = 20;

function parseDate(value, endOfDay) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

function buildWhere(query) {
  const from = parseDate(query.from, false);
  const to = parseDate(query.to, true);
  const where = {};
  if (from || to) {
    where.timestamp = {};
    if (from) where.timestamp.gte = from;
    if (to) where.timestamp.lte = to;
  }
  if (query.status === "granted" || query.status === "denied") {
    where.status = query.status;
  }
  return where;
}

function formatRow(row) {
  return {
    uid: row.uid,
    username: row.username,
    timestamp: row.timestamp,
    status: row.status,
    sensor: row.sensor,
  };
}

function attachLogRoutes(app) {
  app.get("/api/logs", async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const where = buildWhere(req.query);
      const [total, rows] = await Promise.all([
        prisma.logsTransaction.count({ where }),
        prisma.logsTransaction.findMany({
          where,
          orderBy: { timestamp: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
      ]);
      res.json({
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        rows: rows.map(formatRow),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/logs/export", async (req, res, next) => {
    try {
      const format = req.query.format === "pdf" ? "pdf" : "csv";
      const where = buildWhere(req.query);
      const rows = await prisma.logsTransaction.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: 5000,
      });

      const fromLabel = req.query.from || "awal";
      const toLabel = req.query.to || "akhir";

      if (format === "csv") {
        const header = "timestamp,username,sensor,status";
        const body = rows
          .map(
            (r) =>
              `${r.timestamp.toISOString()},${csvCell(r.username)},${r.sensor},${r.status}`
          )
          .join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="ms-acm-log-${fromLabel}-to-${toLabel}.csv"`
        );
        return res.send(`${header}\n${body}\n`);
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ms-acm-log-${fromLabel}-to-${toLabel}.pdf"`
      );
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      doc.pipe(res);
      doc.fontSize(16).text("Laporan Log Akses MS-ACM");
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .fillColor("#444")
        .text(`Rentang: ${fromLabel} s/d ${toLabel}`)
        .text(`Dicetak: ${new Date().toISOString()}`)
        .text(`Jumlah baris: ${rows.length}`);
      doc.moveDown();
      doc.fillColor("#000").fontSize(9);
      const cols = [40, 190, 320, 420];
      doc.text("Waktu", cols[0], doc.y, { continued: false });
      const y0 = doc.y - 11;
      doc.text("Username", cols[1], y0);
      doc.text("Sensor", cols[2], y0);
      doc.text("Status", cols[3], y0);
      doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).stroke();
      doc.moveDown(0.6);
      for (const row of rows) {
        if (doc.y > 760) doc.addPage();
        const y = doc.y;
        doc.text(row.timestamp.toISOString().replace("T", " ").slice(0, 19), cols[0], y);
        doc.text(row.username, cols[1], y);
        doc.text(row.sensor, cols[2], y);
        doc.text(row.status, cols[3], y);
        doc.moveDown(0.4);
      }
      doc.end();
    } catch (err) {
      next(err);
    }
  });
}

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

module.exports = { attachLogRoutes };
