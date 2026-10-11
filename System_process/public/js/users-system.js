function renderUsers(users) {
  const tbody = document.getElementById("sys-rows");
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="3">Belum ada user sistem</td></tr>';
    return;
  }
  tbody.innerHTML = users
    .map(
      (u) => `<tr>
        <td>${u.username}</td>
        <td>${fmtTime(u.createdAt)}</td>
        <td>
          ${
            u.username === "admin"
              ? '<span class="tag inactive">default</span>'
              : `<button class="btn danger" data-del="${u.uid}">Hapus</button>`
          }
        </td>
      </tr>`
    )
    .join("");
}

async function loadUsers() {
  const data = await api("/api/users/system");
  renderUsers(data.users);
}

document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.getElementById("sys-dialog");
  const form = document.getElementById("sys-form");
  const error = document.getElementById("sys-error");

  document.getElementById("add-sys-btn").addEventListener("click", () => {
    form.reset();
    error.hidden = true;
    dialog.showModal();
  });
  document.getElementById("sys-close-btn").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    try {
      await api("/api/users/system", {
        method: "POST",
        body: {
          username: form.username.value.trim(),
          password: form.password.value,
        },
      });
      dialog.close();
      await loadUsers();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  });

  document.getElementById("sys-rows").addEventListener("click", async (ev) => {
    const del = ev.target.closest("[data-del]");
    if (!del) return;
    if (!confirm("Hapus user sistem ini?")) return;
    try {
      await api(`/api/users/system/${del.getAttribute("data-del")}`, { method: "DELETE" });
      await loadUsers();
    } catch (err) {
      alert(err.message);
    }
  });

  connectRealtime();
  loadUsers().catch((err) => {
    document.getElementById("sys-rows").innerHTML = `<tr><td colspan="3">${err.message}</td></tr>`;
  });
});
