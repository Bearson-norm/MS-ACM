const PROGRESS_TEXT = {
  place_finger: "Letakkan jari pada sensor akses",
  remove_finger: "Angkat jari",
  place_again: "Letakkan jari yang sama sekali lagi",
  storing: "Menyimpan template ke sensor",
  done: "Enroll selesai",
};

function renderUsers(users) {
  const tbody = document.getElementById("user-rows");
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5">Belum ada user mesin</td></tr>';
    return;
  }
  tbody.innerHTML = users
    .map(
      (u) => `<tr>
        <td>${u.username}</td>
        <td>${u.fingerprintId}</td>
        <td><span class="tag ${u.isActive ? "granted" : "inactive"}">${u.isActive ? "aktif" : "nonaktif"}</span></td>
        <td>${fmtTime(u.createdAt)}</td>
        <td>
          <button class="btn ghost" data-toggle="${u.uid}" data-active="${u.isActive}">${u.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
          <button class="btn danger" data-del="${u.uid}">Hapus</button>
        </td>
      </tr>`
    )
    .join("");
}

async function loadUsers() {
  const data = await api("/api/users/machine");
  renderUsers(data.users);
  setHardwareStatus(data.hardware);
}

document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.getElementById("enroll-dialog");
  const form = document.getElementById("enroll-form");
  const progress = document.getElementById("enroll-progress");
  const error = document.getElementById("enroll-error");
  const passwordInput = document.getElementById("enroll-password");
  const startBtn = document.getElementById("enroll-start-btn");

  connectRealtime((msg) => {
    if (msg.type === "enroll_progress") {
      const step = msg.payload && msg.payload.step;
      progress.textContent = PROGRESS_TEXT[step] || step || "Memproses…";
    }
  });

  document.getElementById("add-user-btn").addEventListener("click", () => {
    form.reset();
    passwordInput.value = "";
    error.hidden = true;
    progress.textContent = "Siap mendaftar";
    startBtn.disabled = false;
    dialog.showModal();
  });
  document.getElementById("enroll-close-btn").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    startBtn.disabled = true;
    progress.textContent = "Mengirim perintah enroll…";
    try {
      const data = await api("/api/users/machine/enroll", {
        method: "POST",
        body: { username: form.username.value.trim() },
      });
      passwordInput.value = data.passwordHash || "";
      progress.textContent = "User tersimpan";
      await loadUsers();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
      startBtn.disabled = false;
    }
  });

  document.getElementById("user-rows").addEventListener("click", async (ev) => {
    const toggle = ev.target.closest("[data-toggle]");
    const del = ev.target.closest("[data-del]");
    try {
      if (toggle) {
        const isActive = toggle.getAttribute("data-active") !== "true";
        await api(`/api/users/machine/${toggle.getAttribute("data-toggle")}/active`, {
          method: "PATCH",
          body: { isActive },
        });
        await loadUsers();
      }
      if (del && confirm("Hapus user ini dari sensor dan database?")) {
        await api(`/api/users/machine/${del.getAttribute("data-del")}`, { method: "DELETE" });
        await loadUsers();
      }
    } catch (err) {
      alert(err.message);
    }
  });

  loadUsers().catch((err) => {
    document.getElementById("user-rows").innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
  });
});
