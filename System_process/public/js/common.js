async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

function setHardwareStatus(status) {
  const el = document.getElementById("hw-status");
  if (!el || !status) return;
  el.classList.remove("ok", "off", "busy");
  if (!status.connected) {
    el.classList.add("off");
    el.textContent = "Hardware offline";
  } else if (status.busy) {
    el.classList.add("busy");
    el.textContent = "Hardware sibuk";
  } else {
    el.classList.add("ok");
    el.textContent = "Hardware online";
  }
}

function connectRealtime(onMessage) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (_) {
      return;
    }
    if (msg.type === "hello" || msg.type === "hardware_status") {
      setHardwareStatus(msg.payload && (msg.payload.hardware || msg.payload));
    }
    if (onMessage) onMessage(msg);
  });
  return ws;
}

function fmtTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID");
}

document.addEventListener("DOMContentLoaded", () => {
  const logout = document.getElementById("logout-btn");
  if (logout) {
    logout.addEventListener("click", async () => {
      await api("/api/logout", { method: "POST", body: {} });
      location.href = "/login";
    });
  }
});
