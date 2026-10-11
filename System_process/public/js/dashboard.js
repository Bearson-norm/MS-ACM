const JAKARTA_TZ = "Asia/Jakarta";

function renderJakartaDate() {
  const el = document.getElementById("dashboard-date");
  if (!el) return;
  el.textContent = new Date().toLocaleDateString("id-ID", {
    timeZone: JAKARTA_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function renderStats(stats) {
  if (!stats) return;
  const grantedToday = stats.grantedToday ?? stats.granted;
  const deniedToday = stats.deniedToday ?? stats.denied;
  document.getElementById("stat-granted").textContent = grantedToday;
  document.getElementById("stat-denied").textContent = deniedToday;
  document.getElementById("stat-granted-total").textContent =
    stats.grantedTotal ?? stats.granted;
  document.getElementById("stat-denied-total").textContent =
    stats.deniedTotal ?? stats.denied;
}

function nextJakartaMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year").value);
  const month = Number(parts.find((part) => part.type === "month").value);
  const day = Number(parts.find((part) => part.type === "day").value);
  return new Date(Date.UTC(year, month - 1, day + 1, -7, 0, 0, 0));
}

async function loadDashboard() {
  const data = await api("/api/dashboard/stats");
  renderJakartaDate();
  renderStats(data.stats);
  setHardwareStatus(data.hardware);
}

function scheduleJakartaMidnightRefresh(fn) {
  const delay = Math.max(1000, nextJakartaMidnight().getTime() - Date.now() + 250);
  return setTimeout(async () => {
    try {
      await fn();
    } catch (err) {
      console.error(err);
    }
    scheduleJakartaMidnightRefresh(fn);
  }, delay);
}

document.addEventListener("DOMContentLoaded", async () => {
  renderJakartaDate();
  connectRealtime((msg) => {
    if (msg.type === "verify_result" && msg.payload && msg.payload.stats) {
      renderStats(msg.payload.stats);
    }
  });
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try {
      await loadDashboard();
    } catch (err) {
      console.error(err);
    }
  });
  scheduleJakartaMidnightRefresh(loadDashboard);
  try {
    await loadDashboard();
  } catch (err) {
    console.error(err);
  }
});
