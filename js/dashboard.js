// /js/dashboard.js
import { db } from "./firebase-core.js";

import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   Collections
========================================================= */
const STOCKS_COL = collection(db, "stocks");
const COMMS_COL = collection(db, "communications");

/* =========================================================
   Alert rules
========================================================= */
const CONSUMABLE_ALERTS = new Set(["Low", "Critical", "Damaged", "Missing"]);
const FIXTURE_ALERTS = new Set(["Damaged", "Missing"]);
const COMMS_ALERTS = new Set(["Spoilt / Decommissioned"]);

/* =========================================================
   Helpers
========================================================= */
function safeNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

function severityFor(module, status) {
  if (module === "Consumable") {
    if (status === "Critical" || status === "Missing") return "high";
    if (status === "Damaged" || status === "Low") return "med";
  }
  if (module === "Fixture") {
    if (status === "Missing") return "high";
    if (status === "Damaged") return "med";
  }
  if (module === "Comms") return "high";
  return "med";
}

function buildAlertCard({ severity, module, title, status, location, link }) {
  return `
    <a class="alert-card ${escapeHtml(severity)}" href="${escapeHtml(link)}">
      <div class="alert-top">
        <div class="alert-module">${escapeHtml(module)}</div>
        <div class="alert-status">${escapeHtml(status)}</div>
      </div>
      <div class="alert-title">${escapeHtml(title)}</div>
      <div class="alert-location">${escapeHtml(location)}</div>
    </a>
  `;
}

/* =========================================================
   Data fetching
========================================================= */
async function fetchStocks() {
  const snap = await getDocs(STOCKS_COL);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchComms() {
  const snap = await getDocs(COMMS_COL);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* =========================================================
   Summary
========================================================= */
async function renderSummary(records) {
  const summaryEl = document.getElementById("summary");
  if (!summaryEl) return;

  try {
    const totalRecords = records.length;
    const consumables = records.filter((r) => r.type === "consumable");
    const fixtures = records.filter((r) => r.type === "fixture");

    const sumQty = (list) => list.reduce((acc, r) => acc + safeNum(r.quantity), 0);

    const cards = [
      { num: totalRecords, label: "Total Records" },
      { num: `${consumables.length} (Qty ${sumQty(consumables)})`, label: "Consumables" },
      { num: `${fixtures.length} (Qty ${sumQty(fixtures)})`, label: "Fixtures" },
    ];

    summaryEl.innerHTML = cards
      .map(
        (c) => `
        <div class="summary-card">
          <div class="summary-num">${escapeHtml(String(c.num))}</div>
          <div class="summary-label">${escapeHtml(c.label)}</div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    console.error(err);
    summaryEl.innerHTML = `<div class="small">Failed to load summary (Firestore permissions/network).</div>`;
  }
}

/* =========================================================
   Alerts
========================================================= */
async function renderAlerts(stocksRecords, commsRecords) {
  const summaryEl = document.getElementById("alertsSummary");
  const listEl = document.getElementById("alertsList");
  if (!summaryEl || !listEl) return;

  try {
    const alerts = [];

    // Stocks alerts
    for (const r of stocksRecords) {
      const type = r.type;
      const status = r.status;

      if (type === "consumable" && CONSUMABLE_ALERTS.has(status)) {
        alerts.push({
          module: "Consumable",
          title: r.name ?? "Unnamed",
          status,
          location: `${r.locMain ?? ""} / ${r.locExact ?? ""}`.trim(),
          link: "consumable-records.html",
          severity: severityFor("Consumable", status),
        });
      }

      if (type === "fixture" && FIXTURE_ALERTS.has(status)) {
        alerts.push({
          module: "Fixture",
          title: r.name ?? "Unnamed",
          status,
          location: `${r.locMain ?? ""} / ${r.locExact ?? ""}`.trim(),
          link: "fixture-records.html",
          severity: severityFor("Fixture", status),
        });
      }
    }

    // Comms alerts
    for (const r of commsRecords) {
      const status = r.status;
      if (COMMS_ALERTS.has(status)) {
        const setNo = r.setNumber ?? "";
        const cs = r.callSign ? ` (${r.callSign})` : "";
        alerts.push({
          module: "Comms",
          title: `Set ${setNo}${cs}`.trim(),
          status,
          location: (r.locationOfUse ?? "").trim(),
          link: "communications.html",
          severity: severityFor("Comms", status),
        });
      }
    }

    const order = { high: 0, med: 1 };
    alerts.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

    if (alerts.length === 0) {
      summaryEl.textContent = "All systems normal.";
      listEl.innerHTML = `<div class="small">No active alerts 🎉</div>`;
      return;
    }

    summaryEl.textContent = `${alerts.length} alert(s) require attention`;
    listEl.innerHTML = alerts.map(buildAlertCard).join("");
  } catch (err) {
    console.error(err);
    summaryEl.textContent = "Error loading alerts.";
    listEl.innerHTML = `<div class="small">Failed to load alerts (Firestore permissions/network).</div>`;
  }
}

/* =========================================================
   Wizard (GLOBAL across all pages)
   - Skip/quit once on dashboard => no wizards anywhere
   - Uses existing dashboard wizard DOM (#wizardGate, #wizardStep, etc.)
   - Quit anytime: Skip / Close / ESC / clicking backdrop
========================================================= */
const WIZARD_GLOBAL_KEY = "wizard_seen__ALL__v1";
const WIZARD_PAGE_KEY = "wizard_seen__dashboard__v1";

// Backward-compat key (existing dashboard key)
const LEGACY_DASH_KEY = "fa_dashboard_wizard_seen";

// Older legacy keys you used previously
const LEGACY_KEYS = ["fa_wizard_seen_v1", "fa_wizard_seen_v2", "fa_wizard_seen_v3"];

function safeGet(key, storage) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, val, storage) {
  try {
    storage.setItem(key, val);
  } catch {
    // ignore
  }
}

function markAllWizardsSeen() {
  // persist strongly
  safeSet(WIZARD_GLOBAL_KEY, "1", localStorage);
  safeSet(WIZARD_GLOBAL_KEY, "1", sessionStorage);
}

function markThisWizardSeen() {
  safeSet(WIZARD_PAGE_KEY, "1", localStorage);
  safeSet(WIZARD_PAGE_KEY, "1", sessionStorage);
}

function hasSeenGlobalWizard() {
  const s1 = safeGet(WIZARD_GLOBAL_KEY, sessionStorage);
  const l1 = safeGet(WIZARD_GLOBAL_KEY, localStorage);
  return s1 === "1" || l1 === "1";
}

function hasSeenThisWizard() {
  const s1 = safeGet(WIZARD_PAGE_KEY, sessionStorage);
  const l1 = safeGet(WIZARD_PAGE_KEY, localStorage);
  return s1 === "1" || l1 === "1";
}

function shouldShowWizard() {
  // If both storage calls fail, safest is not to show (prevents loops / “broken” wizard)
  const globalL = safeGet(WIZARD_GLOBAL_KEY, localStorage);
  const pageL = safeGet(WIZARD_PAGE_KEY, localStorage);
  const globalS = safeGet(WIZARD_GLOBAL_KEY, sessionStorage);
  const pageS = safeGet(WIZARD_PAGE_KEY, sessionStorage);

  const storageBlocked = globalL === null && pageL === null && globalS === null && pageS === null;
  if (storageBlocked) return false;

  return !hasSeenGlobalWizard() && !hasSeenThisWizard();
}

(function migrateWizardKeysToGlobal() {
  // If user has ANY old wizard key set, treat as “seen globally”
  try {
    const legacySeen =
      localStorage.getItem(LEGACY_DASH_KEY) === "1" ||
      LEGACY_KEYS.some((k) => localStorage.getItem(k) === "1");

    if (legacySeen) {
      // set global + this page so it will never re-open
      localStorage.setItem(WIZARD_GLOBAL_KEY, "1");
      localStorage.setItem(WIZARD_PAGE_KEY, "1");

      // also mirror in session to avoid re-show within session
      try { sessionStorage.setItem(WIZARD_GLOBAL_KEY, "1"); } catch {}
      try { sessionStorage.setItem(WIZARD_PAGE_KEY, "1"); } catch {}
    }
  } catch {
    // ignore
  }
})();

function initDashboardWizard() {
  const gate = document.getElementById("wizardGate");
  const step = document.getElementById("wizardStep");
  if (!gate || !step) return;

  const startBtn = document.getElementById("wizardStartBtn");
  const skipBtn = document.getElementById("wizardSkipBtn");

  const titleEl = document.getElementById("wizardTitle");
  const textEl = document.getElementById("wizardText");
  const progEl = document.getElementById("wizardProgress");

  const backBtn = document.getElementById("wizardBackBtn");
  const nextBtn = document.getElementById("wizardNextBtn");
  const doneBtn = document.getElementById("wizardDoneBtn");
  const closeBtn = document.getElementById("wizardCloseBtn");
  const actionBtn = document.getElementById("wizardActionBtn");

  if (
    !startBtn || !skipBtn ||
    !titleEl || !textEl || !progEl ||
    !backBtn || !nextBtn || !doneBtn || !closeBtn || !actionBtn
  ) {
    console.warn("Wizard DOM missing required elements. Wizard disabled.");
    return;
  }

  const steps = [
    {
      title: "How to handle alerts",
      html: `
        <ol style="margin:0; padding-left:18px">
          <li>Check <b>Operational Alerts</b>.</li>
          <li>Click an alert card to open the correct page.</li>
          <li>Edit the record to fix the issue (status/location/qty).</li>
        </ol>
      `,
    },
    {
      title: "Add items",
      html: `
        <ol style="margin:0; padding-left:18px">
          <li>Open <b>Stock Management</b>.</li>
          <li>Select <b>Consumable</b> or <b>Fixture</b>.</li>
          <li>Fill Name, Category, Location (Main + Exact), Site status.</li>
          <li>Qty is optional → press <b>Save</b>.</li>
        </ol>
      `,
      action: { label: "Open Stock Management", href: "stock-management.html" },
    },
    {
      title: "Edit records (inline, no popups)",
      html: `
        <ol style="margin:0; padding-left:18px">
          <li>Open <b>Consumables</b> or <b>Fixtures</b>.</li>
          <li>Press <b>Edit</b> on a row.</li>
          <li>Change fields directly in the table.</li>
          <li>Press <b>Save</b> to apply to Firebase.</li>
        </ol>
      `,
      action: { label: "Open Consumables", href: "consumable-records.html" },
    },
    {
      title: "Transfer (location change)",
      html: `
        <ol style="margin:0; padding-left:18px">
          <li>Transfer means <b>changing location</b>.</li>
          <li>Update Main + Exact location.</li>
          <li>Qty can be adjusted if you move part of the stock (optional).</li>
        </ol>
      `,
    },
    {
      title: "Communications (radio sets)",
      html: `
        <ol style="margin:0; padding-left:18px">
          <li>Open <b>Comms</b>.</li>
          <li>Update each radio set’s status.</li>
          <li><b>Spoilt / Decommissioned</b> appears in Dashboard Alerts.</li>
        </ol>
      `,
      action: { label: "Open Comms", href: "communications.html" },
    },
  ];

  let i = 0;

  // Strong show/hide controls to avoid “slightly broken” state
  function hardHide(el) {
    el.hidden = true;
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }

  function hardShow(el, display = "grid") {
    el.hidden = false;
    el.style.display = display;
    el.setAttribute("aria-hidden", "false");
  }

  function lockBody() {
    document.body.style.overflow = "hidden";
  }

  function unlockBody() {
    document.body.style.overflow = "";
  }

  function finishWizard() {
    // finishing/skipping dashboard wizard = skip ALL page wizards
    markAllWizardsSeen();
    markThisWizardSeen();

    // Also set legacy dashboard key so old logic (if any) won’t re-trigger elsewhere
    try { localStorage.setItem(LEGACY_DASH_KEY, "1"); } catch {}

    hardHide(gate);
    hardHide(step);
    unlockBody();
  }

  function showGate() {
    // Gate overlay should visually match wizard overlay styles
    // If your CSS expects display:grid, keep it
    hardShow(gate, "grid");
    hardHide(step);
    lockBody();
  }

  function showStep() {
    hardHide(gate);
    hardShow(step, "grid");
    lockBody();
  }

  function renderStep() {
    const s = steps[i];

    progEl.textContent = `Step ${i + 1} of ${steps.length}`;
    titleEl.textContent = s.title;
    textEl.innerHTML = s.html;

    backBtn.disabled = i === 0;
    nextBtn.hidden = i === steps.length - 1;
    doneBtn.hidden = i !== steps.length - 1;

    if (s.action) {
      actionBtn.hidden = false;
      actionBtn.textContent = s.action.label;

      // Important: remove any previous handler safely by overwriting
      actionBtn.onclick = () => {
        finishWizard();
        location.href = s.action.href;
      };
    } else {
      actionBtn.hidden = true;
      actionBtn.textContent = "";
      actionBtn.onclick = null;
    }
  }

  function startWizard() {
    i = 0;
    renderStep();
    showStep();

    // Focus first meaningful action for accessibility
    try { nextBtn.focus(); } catch {}
  }

  // Ensure everything is hidden first to prevent flicker
  hardHide(gate);
  hardHide(step);
  unlockBody();

  // Only show if global + page not seen
  if (shouldShowWizard()) {
    showGate();
  } else {
    finishWizard();
  }

  // Buttons
  startBtn.addEventListener("click", startWizard);
  skipBtn.addEventListener("click", finishWizard);

  backBtn.addEventListener("click", () => {
    if (i > 0) i -= 1;
    renderStep();
  });

  nextBtn.addEventListener("click", () => {
    if (i < steps.length - 1) i += 1;
    renderStep();
  });

  doneBtn.addEventListener("click", finishWizard);
  closeBtn.addEventListener("click", finishWizard);

  // Clicking the overlay background should close too (quit anytime)
  gate.addEventListener("click", (e) => {
    if (e.target === gate) finishWizard();
  });
  step.addEventListener("click", (e) => {
    if (e.target === step) finishWizard();
  });

  // ESC to close if open
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!gate.hidden || !step.hidden) finishWizard();
  });
}

/* =========================================================
   Init
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [stocks, comms] = await Promise.all([fetchStocks(), fetchComms()]);
    renderSummary(stocks);
    renderAlerts(stocks, comms);
  } catch (err) {
    console.error("Dashboard init failed:", err);
    renderSummary([]);
    renderAlerts([], []);
  }

  initDashboardWizard();
});
