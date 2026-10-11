"use strict";

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if ((req.originalUrl || req.path || "").startsWith("/api/")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect("/login");
  }
  next();
}

function requireGuest(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect("/");
  }
  next();
}

module.exports = { requireAuth, requireGuest };
