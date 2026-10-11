const state = { page: 1, totalPages: 1 };

function filters() {
  const form = document.getElementById("filter-form");
  return {
    from: form.from.value,
    to: form.to.value,
    status: form.status.value,
  };
}

function queryString(extra = {}) {
  const params = new URLSearchParams();
  const all = { ...filters(), ...extra };
  Object.entries(all).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  return params.toString();
}

function renderRows(rows) {
  const tbody = document.getElementById("log-rows");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4">Tidak ada data</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (row) => `<tr>
        <td>${fmtTime(row.timestamp)}</td>
        <td>${row.username}</td>
        <td>${row.sensor}</td>
        <td><span class="tag ${row.status}">${row.status}</span></td>
      </tr>`
    )
    .join("");
}

async function loadLogs() {
  const qs = queryString({ page: state.page });
  const data = await api(`/api/logs?${qs}`);
  state.page = data.page;
  state.totalPages = data.totalPages;
  renderRows(data.rows);
  document.getElementById("page-info").textContent = `Halaman ${data.page} / ${data.totalPages}`;
  document.getElementById("prev-page").disabled = data.page <= 1;
  document.getElementById("next-page").disabled = data.page >= data.totalPages;
}

document.addEventListener("DOMContentLoaded", () => {
  connectRealtime((msg) => {
    if (msg.type === "verify_result") loadLogs().catch(() => {});
  });
  document.getElementById("filter-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    state.page = 1;
    loadLogs().catch((err) => alert(err.message));
  });
  document.getElementById("prev-page").addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    loadLogs();
  });
  document.getElementById("next-page").addEventListener("click", () => {
    state.page += 1;
    loadLogs();
  });
  document.querySelectorAll("[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.getAttribute("data-export");
      location.href = `/api/logs/export?${queryString({ format })}`;
    });
  });
  loadLogs().catch((err) => {
    document.getElementById("log-rows").innerHTML = `<tr><td colspan="4">${err.message}</td></tr>`;
  });
});
