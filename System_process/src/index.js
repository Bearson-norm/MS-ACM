"use strict";

require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const config = require("./config");
const { acquirePid } = require("./pidfile");
const { requireAuth, requireGuest } = require("./middleware/auth");
const { attachAuthRoutes } = require("./routes/auth");
const { attachDashboardRoutes } = require("./routes/dashboard");
const { attachLogRoutes } = require("./routes/logs");
const { attachUserMachineRoutes } = require("./routes/usersMachine");
const { attachUserSystemRoutes } = require("./routes/usersSystem");
const { attachDebugRoutes } = require("./routes/debug");
const { setupWebSockets } = require("./ws");
const { hardwareGateway } = require("./hardwareGateway");

acquirePid(config.pidFile);

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/public", express.static(path.join(__dirname, "..", "public")));

const sessionParser = session({
  name: "msacm.sid",
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
  },
});
app.use(sessionParser);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.hardware = hardwareGateway.status();
  next();
});

app.get("/login", requireGuest, (req, res) => {
  res.render("login", { title: "Masuk" });
});

app.get("/", requireAuth, (req, res) => {
  res.render("dashboard", { title: "Dashboard", nav: "dashboard" });
});

app.get("/logs", requireAuth, (req, res) => {
  res.render("logs", { title: "Log Attempt", nav: "logs" });
});

app.get("/users", requireAuth, (req, res) => {
  res.render("users-machine", { title: "User Management", nav: "users" });
});

app.get("/users-system", requireAuth, (req, res) => {
  res.render("users-system", { title: "User System", nav: "users-system" });
});

attachAuthRoutes(app);
app.use("/api", requireAuth);
attachDashboardRoutes(app);
attachLogRoutes(app);
attachUserMachineRoutes(app);
attachUserSystemRoutes(app);
attachDebugRoutes(app);

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  if (req.path.startsWith("/api/")) {
    return res.status(status).json({ error: message, code: err.code || null });
  }
  res.status(status).send(message);
});

const server = http.createServer(app);
setupWebSockets(server, sessionParser);

server.listen(config.port, "0.0.0.0", () => {
  console.log(`System_process listening on http://localhost:${config.port}`);
});
