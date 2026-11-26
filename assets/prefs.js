/*
 * nolanpix.github.io: theme (dark / light) and language (zh / en) switches.
 *
 * Load as a plain (non-deferred) <script> in <head>, after <title> and the
 * stylesheet, so the saved choice is on <html> before the first paint:
 *   data-theme="dark|light"  no saved choice -> follows the OS setting
 *   data-lang="zh|en" + lang default zh; elements marked lang="zh-CN" or
 *                            lang="en" are shown only in their language
 * Buttons: <button data-pref="lang"> and <button data-pref="theme">.
 * Elements with data-aria-en get their aria-label swapped with the language.
 * Admin links (another origin) carry the current theme as ?theme=light|dark.
 * Links back from the admin carry ?theme=light|dark, which this script adopts.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var system = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  var zhTitle = document.title;
  var LABELS = {
    zh: { lang: "Switch to English", dark: "切换到浅色模式", light: "切换到深色模式" },
    en: { lang: "切换到中文", dark: "Switch to light mode", light: "Switch to dark mode" }
  };

  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode: not remembered */ }
  }
  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function savedTheme() {
    var t = load("np:theme");
    return t === "light" || t === "dark" ? t : null;
  }
  // The admin hands its tone and language back as ?theme=light|dark&lang=zh|en on
  // "Back to blog". Adopt both, remember them, then drop them so a later switch is
  // not undone by a stale URL.
  function incomingPrefs() {
    var got = {}, q;
    try { q = new URLSearchParams(location.search); } catch (e) { return got; }
    var t = q.get("theme");
    if (t === "light" || t === "dark") { got.theme = t; save("np:theme", t); }
    var l = q.get("lang");
    if (l === "zh" || l === "en") { got.lang = l; save("np:lang", l); }
    if (got.theme || got.lang) {
      try {
        var u = new URL(location.href);
        u.searchParams.delete("theme");
        u.searchParams.delete("lang");
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) { /* file:// or old browser: the saved choice still applies */ }
    }
    return got;
  }
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    syncAdminLinks();
  }
  function applyLang(lang) {
    root.setAttribute("data-lang", lang);
    root.lang = lang === "en" ? "en" : "zh-CN";
    var enTitle = root.getAttribute("data-title-en");
    document.title = lang === "en" && enTitle ? enTitle : zhTitle;
    syncAdminLinks();
  }
  // The admin runs on the Worker origin and cannot read np:theme / np:lang. Hand both
  // over in the link; its page applies them and remembers them under npa:*.
  function syncAdminLinks() {
    var theme = root.getAttribute("data-theme");
    var lang = root.getAttribute("data-lang");
    each('a[href*="/admin"]', function (a) {
      try {
        var u = new URL(a.getAttribute("href"), location.href);
        if (u.origin === location.origin) return;
        u.searchParams.set("theme", theme);
        u.searchParams.set("lang", lang);
        a.setAttribute("href", u.href);
      } catch (e) { /* keep the link as written */ }
    });
  }

  var incoming = incomingPrefs();
  applyTheme(incoming.theme || savedTheme() || (system && system.matches ? "light" : "dark"));
  applyLang(incoming.lang || (load("np:lang") === "en" ? "en" : "zh"));

  function refresh() {
    var lang = root.getAttribute("data-lang");
    var words = LABELS[lang];
    each('[data-pref="lang"]', function (b) {
      b.setAttribute("aria-label", words.lang);
      b.title = words.lang;
    });
    each('[data-pref="theme"]', function (b) {
      var label = words[root.getAttribute("data-theme")];
      b.setAttribute("aria-label", label);
      b.title = label;
    });
    each("[data-aria-en]", function (el) {
      if (!el.hasAttribute("data-aria-zh")) el.setAttribute("data-aria-zh", el.getAttribute("aria-label") || "");
      el.setAttribute("aria-label", el.getAttribute(lang === "en" ? "data-aria-en" : "data-aria-zh"));
    });
  }

  function wire() {
    each('[data-pref="lang"]', function (b) {
      b.addEventListener("click", function () {
        var next = root.getAttribute("data-lang") === "en" ? "zh" : "en";
        applyLang(next);
        save("np:lang", next);
        refresh();
      });
    });
    each('[data-pref="theme"]', function (b) {
      b.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        applyTheme(next);
        save("np:theme", next);
        refresh();
      });
    });
    syncAdminLinks();
    refresh();
  }

  // Follow OS changes until the visitor picks a theme; keep open tabs in step.
  if (system && system.addEventListener) {
    system.addEventListener("change", function () {
      if (!savedTheme()) { applyTheme(system.matches ? "light" : "dark"); refresh(); }
    });
  }
  window.addEventListener("storage", function (e) {
    if (e.key === "np:theme" && savedTheme()) applyTheme(savedTheme());
    if (e.key === "np:lang") applyLang(e.newValue === "en" ? "en" : "zh");
    if (e.key === "np:theme" || e.key === "np:lang") refresh();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
