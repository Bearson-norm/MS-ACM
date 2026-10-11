document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const error = document.getElementById("login-error");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    const body = {
      username: form.username.value.trim(),
      password: form.password.value,
    };
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal masuk");
      location.href = "/";
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  });
});
