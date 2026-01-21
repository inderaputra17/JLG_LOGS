// /js/dashboard.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAwyIghTzxPQ3veDYljtOYZg4b0EiJ5hr4",
  authDomain: "first-aid-app-8ae79.firebaseapp.com",
  projectId: "first-aid-app-8ae79",
  storageBucket: "first-aid-app-8ae79.firebasestorage.app",
  messagingSenderId: "759107374304",
  appId: "1:759107374304:web:efb87e2c55a32e95129485"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// collections
const STOCKS_COL = collection(db, "stocks");
const COMMS_COL = collection(db, "communications");

// alert rules
const CONSUMABLE_ALERTS = new Set(["Low", "Critical", "Damaged", "Missing"]);
const FIXTURE_ALERTS = new Set(["Damaged", "Missing"]);
const COMMS_ALERTS = new Set(["Spoilt / Decommissioned"]);

/* ---------------------------
   Helpers
---------------------------- */
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

/* ---------------------------
   Summary
---------------------------- */
async function renderSummary() {
  const summaryEl = document.getElementById("summary");
  if (!summaryEl) return;

  try {
    const snap = await getDocs(STOCKS_COL);
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const totalRecords = records.length;
    const consumables = records.filter(r => r.type === "consumable");
    const fixtures = records.filter(r => r.type === "fixture");

    const sumQty = (list) => list.reduce((acc, r) => acc + safeNum(r.quantity), 0);

    const cards = [
      { num: totalRecords, label: "Total Records" },
      { num: `${consumables.length} (Qty ${sumQty(consumables)})`, label: "Consumables" },
      { num: `${fixtures.length} (Qty ${sumQty(fixtures)})`, label: "Fixtures" },
    ];

    summaryEl.innerHTML = cards.map(c => `
      <div class="summary-card">
        <div class="summary-num">${escapeHtml(String(c.num))}</div>
        <div class="summary-label">${escapeHtml(c.label)}</div>
      </div>
    `).join("");
  } catch (err) {
    console.error(err);
    summaryEl.innerHTML = `<div class="small">Failed to load summary (Firestore permissions/network).</div>`;
  }
}

/* ---------------------------
   Alerts
---------------------------- */
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
    <a class="alert-card ${severity}" href="${link}">
      <div class="alert-top">
        <div class="alert-module">${escapeHtml(module)}</div>
        <div class="alert-status">${escapeHtml(status)}</div>
      </div>
      <div class="alert-title">${escapeHtml(title)}</div>
      <div class="alert-location">${escapeHtml(location)}</div>
    </a>
  `;
}

async function renderAlerts() {
  const summaryEl = document.getElementById("alertsSummary");
  const listEl = document.getElementById("alertsList");
  if (!summaryEl || !listEl) return;

  try {
    const alerts = [];

    // stocks
    const stockSnap = await getDocs(STOCKS_COL);
    stockSnap.forEach(d => {
      const r = d.data();
      const type = r.type;
      const status = r.status;

      if (type === "consumable" && CONSUMABLE_ALERTS.has(status)) {
        alerts.push({
          module: "Consumable",
          title: r.name ?? "Unnamed",
          status,
          location: `${r.locMain ?? ""} / ${r.locExact ?? ""}`,
          link: "consumable-records.html",
          severity: severityFor("Consumable", status),
        });
      }

      if (type === "fixture" && FIXTURE_ALERTS.has(status)) {
        alerts.push({
          module: "Fixture",
          title: r.name ?? "Unnamed",
          status,
          location: `${r.locMain ?? ""} / ${r.locExact ?? ""}`,
          link: "fixture-records.html",
          severity: severityFor("Fixture", status),
        });
      }
    });

    // comms
    const commSnap = await getDocs(COMMS_COL);
    commSnap.forEach(d => {
      const r = d.data();
      const status = r.status;

      if (COMMS_ALERTS.has(status)) {
        const setNo = r.setNumber ?? "";
        const cs = r.callSign ? ` (${r.callSign})` : "";
        alerts.push({
          module: "Comms",
          title: `Set ${setNo}${cs}`.trim(),
          status,
          location: r.locationOfUse ?? "",
          link: "communications.html",
          severity: severityFor("Comms", status),
        });
      }
    });

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

/* ---------------------------
   Wizard (first-time only)
   FIXED: no blank, no re-show on back
---------------------------- */
const WIZ_KEY = "fa_dashboard_wizard_seen";

// migrate old keys once (your current key is v2)
(function migrateWizardKey() {
  const oldKeys = ["fa_wizard_seen_v1", "fa_wizard_seen_v2", "fa_wizard_seen_v3"];
  try {
    for (const k of oldKeys) {
      if (localStorage.getItem(k) === "1") {
        localStorage.setItem(WIZ_KEY, "1");
        break;
      }
    }
  } catch (_) {}
})();

function hasSeenWizard() {
  try {
    if (sessionStorage.getItem(WIZ_KEY) === "1") return true;
  } catch (_) {}
  try {
    return localStorage.getItem(WIZ_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function markWizardSeen() {
  try { localStorage.setItem(WIZ_KEY, "1"); } catch (_) {}
  try { sessionStorage.setItem(WIZ_KEY, "1"); } catch (_) {}
}

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

  if (!startBtn || !skipBtn || !titleEl || !textEl || !progEl || !backBtn || !nextBtn || !doneBtn || !closeBtn || !actionBtn) {
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
      `
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
      action: { label: "Open Stock Management", href: "stock-management.html" }
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
      action: { label: "Open Consumables", href: "consumable-records.html" }
    },
    {
      title: "Transfer (location change)",
      html: `
        <ol style="margin:0; padding-left:18px">
          <li>Transfer means <b>changing location</b>.</li>
          <li>Update Main + Exact location.</li>
          <li>Qty can be adjusted if you move part of the stock (optional).</li>
        </ol>
      `
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
      action: { label: "Open Comms", href: "communications.html" }
    }
  ];

  let i = 0;

  // Force hidden on init (prevents SW cached overlay state)
  gate.hidden = true; gate.style.display = "none";
  step.hidden = true; step.style.display = "none";
  document.body.style.overflow = "";

  function hardHide(el) {
    el.hidden = true;
    el.style.display = "none";
  }
  function hardShow(el) {
    el.hidden = false;
    el.style.display = "grid";
  }

  function lockBody() { document.body.style.overflow = "hidden"; }
  function unlockBody() { document.body.style.overflow = ""; }

  function finishWizard() {
    markWizardSeen();
    hardHide(gate);
    hardHide(step);
    unlockBody();
  }

  function showGate() {
    hardShow(gate);
    hardHide(step);
    lockBody();
  }

  function showStep() {
    hardHide(gate);
    hardShow(step);
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
    renderStep(); // ✅ render FIRST (prevents blank)
    showStep();   // ✅ then show
  }

  // Only show gate if not seen
  if (!hasSeenWizard()) {
    showGate();
  } else {
    // ensure fully closed if already seen
    finishWizard();
  }

  // Gate buttons
  startBtn.addEventListener("click", startWizard);
  skipBtn.addEventListener("click", finishWizard);

  // Step buttons
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

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (!gate.hidden || !step.hidden)) finishWizard();
  });
}

/* ---------------------------
   Init
---------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  renderSummary();
  renderAlerts();
  initDashboardWizard();
});
