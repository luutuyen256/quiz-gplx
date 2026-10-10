/* Chọn giao diện sáng/tối: nhớ lựa chọn trong localStorage, mặc định theo hệ thống.
   Nạp ở <head> (không defer) để không bị nháy sai màu khi tải trang. */
(function () {
  var KEY = "gplx-theme", root = document.documentElement;
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function system() { return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; }
  function apply(t) {
    root.setAttribute("data-theme", t);
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.textContent = t === "light" ? "☾︎" : "☀︎";
      var label = t === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng";
      b.title = label; b.setAttribute("aria-label", label);
    });
  }
  var q = /[?&]theme=(light|dark)/.exec(location.search);
  apply(q ? q[1] : stored() || system());
  document.addEventListener("DOMContentLoaded", function () {
    apply(root.getAttribute("data-theme"));
    document.addEventListener("click", function (e) {
      if (!e.target.closest("[data-theme-toggle]")) return;
      var t = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      try { localStorage.setItem(KEY, t); } catch (err) { /* bỏ qua */ }
      apply(t);
    });
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
    if (!stored()) apply(system());
  });
})();
