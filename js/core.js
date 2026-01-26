/* /js/core.js */
(() => {
  "use strict";

  // Avoid redefining if script is loaded twice
  if (window.StocksCore) return;

  const STORAGE_KEY = "stocks.records.v1";

  const STATUS = Object.freeze({
    consumable: Object.freeze(["Sustainable", "Low", "Critical", "Damaged", "Missing"]),
    fixture: Object.freeze(["Usable", "Damaged", "Missing"]),
  });

  function nowIso() {
    return new Date().toISOString();
  }

  function uid() {
    // Same behavior, slightly safer formatting
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalize(s) {
    return String(s ?? "").trim();
  }

  function safeInt(value, fallback = 0) {
    const n = Number.parseInt(String(value), 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function escapeHtml(str) {
    // Prevents "undefined" becoming literal text
    const s = String(str ?? "");
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c]));
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn("StocksCore.loadRecords: failed to read storage", err);
      return [];
    }
  }

  function saveRecords(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records ?? []));
    } catch (err) {
      console.warn("StocksCore.saveRecords: failed to write storage", err);
    }
  }

  function siteText(siteStatus) {
    return siteStatus === "on_site" ? "On Site" : "Off Site";
  }

  function pill(text) {
    return `<span class="pill">${escapeHtml(text)}</span>`;
  }

  function matchQuery(record, q) {
    if (!q) return true;

    const queryText = normalize(q).toLowerCase();
    if (!queryText) return true;

    const hay = [
      record?.type,
      record?.name,
      record?.category,
      record?.status,
      record?.locMain,
      record?.locExact,
      record?.siteStatus,
    ].join(" ").toLowerCase();

    return hay.includes(queryText);
  }

  function makeRecord(fields) {
    // Preserve original behavior (no schema change)
    return {
      id: uid(),
      type: fields.type,
      name: fields.name,
      category: fields.category,
      status: fields.status,
      quantity: fields.quantity,
      locMain: fields.locMain,
      locExact: fields.locExact,
      siteStatus: fields.siteStatus,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  function setStatusOptions(selectEl, type) {
    if (!selectEl) return;

    selectEl.innerHTML = "";
    const list = STATUS[type] || [];

    for (const s of list) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      selectEl.appendChild(opt);
    }
  }

  function findExactRecord(records, key) {
    const list = Array.isArray(records) ? records : [];
    return list.find((r) =>
      r.type === key.type &&
      r.name === key.name &&
      r.category === key.category &&
      r.status === key.status &&
      r.locMain === key.locMain &&
      r.locExact === key.locExact &&
      r.siteStatus === key.siteStatus
    );
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      // Silent in prod, but helpful in dev
      console.warn("StocksCore.registerSW: failed", err);
    });
  }

  window.StocksCore = Object.freeze({
    STORAGE_KEY,
    STATUS,
    nowIso,
    normalize,
    safeInt,
    escapeHtml,
    loadRecords,
    saveRecords,
    siteText,
    pill,
    matchQuery,
    makeRecord,
    setStatusOptions,
    findExactRecord,
    registerSW,
  });
})();
