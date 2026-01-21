(() => {
  "use strict";

  const STORAGE_KEY = "stocks.records.v1";

  const STATUS = Object.freeze({
    consumable: ["Sustainable", "Low", "Critical", "Damaged", "Missing"],
    fixture: ["Usable", "Damaged", "Missing"],
  });

  function nowIso() {
    return new Date().toISOString();
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalize(s) {
    return String(s ?? "").trim();
  }

  function safeInt(value, fallback = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
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
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function siteText(siteStatus) {
    return siteStatus === "on_site" ? "On Site" : "Off Site";
  }

  function pill(text) {
    return `<span class="pill">${escapeHtml(text)}</span>`;
  }

  function matchQuery(record, q) {
    if (!q) return true;
    const hay = [
      record.type,
      record.name,
      record.category,
      record.status,
      record.locMain,
      record.locExact,
      record.siteStatus,
    ].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function makeRecord(fields) {
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
    return records.find((r) =>
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
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  window.StocksCore = Object.freeze({
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
