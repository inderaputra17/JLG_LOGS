// /js/consumable-records.js
import { db } from "./firebase-core.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   Firestore collection
========================================================= */
const STOCKS_COL = collection(db, "stocks");

/* =========================================================
   Constants
========================================================= */
const CONSUMABLE_STATUS = ["Sustainable", "Low", "Critical", "Damaged", "Missing"];
const SITE_STATUS = [
  { v: "on_site", t: "On Site" },
  { v: "off_site", t: "Off Site" },
];

/* =========================================================
   Wizard (GLOBAL across all pages)
   - Dashboard skip/quit = all pages skip
   - This page will not re-run after it has been seen once
========================================================= */
const WIZARD_GLOBAL_KEY = "wizard_seen__ALL__v1";
const WIZARD_PAGE_KEY = "wizard_seen__consumable_records__v1";

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {
    // ignore
  }
}

function markAllWizardsSeen() {
  safeSet(WIZARD_GLOBAL_KEY, "1");
}

function markThisPageWizardSeen() {
  safeSet(WIZARD_PAGE_KEY, "1");
}

function shouldShowWizard() {
  // If storage is blocked, safest: do not show (prevents broken loops)
  const global = safeGet(WIZARD_GLOBAL_KEY);
  const page = safeGet(WIZARD_PAGE_KEY);
  if (global === null && page === null) return false;
  return global !== "1" && page !== "1";
}

function createWizardOverlay(steps, opts = {}) {
  const overlay = document.createElement("div");
  overlay.className = "wizard-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const card = document.createElement("div");
  card.className = "wizard-card";

  const closeBtn = document.createElement("button");
  closeBtn.className = "wizard-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close wizard");
  closeBtn.textContent = "✕";

  const progress = document.createElement("div");
  progress.className = "wizard-progress";

  const title = document.createElement("div");
  title.className = "tile-title";
  title.style.marginBottom = "6px";

  const body = document.createElement("div");
  body.className = "tile-sub";

  const actions = document.createElement("div");
  actions.className = "wizard-actions";

  const backBtn = document.createElement("button");
  backBtn.className = "btn";
  backBtn.type = "button";
  backBtn.textContent = "Back";

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn primary";
  nextBtn.type = "button";
  nextBtn.textContent = "Next";

  const skipBtn = document.createElement("button");
  skipBtn.className = "btn";
  skipBtn.type = "button";
  skipBtn.textContent = "Skip";

  actions.append(backBtn, nextBtn, skipBtn);
  card.append(closeBtn, progress, title, body, actions);
  overlay.append(card);

  let idx = 0;
  let lastActive = null;

  const focusableSelector =
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

  function renderStep() {
    const s = steps[idx] || { title: "", body: "" };
    progress.textContent = `Step ${idx + 1} of ${steps.length}`;
    title.textContent = s.title || "";
    body.textContent = s.body || "";

    backBtn.disabled = idx === 0;
    nextBtn.textContent = idx === steps.length - 1 ? "Done" : "Next";

    if (s.focusEl && typeof s.focusEl.focus === "function") {
      try {
        s.focusEl.focus({ preventScroll: true });
      } catch {}
      try {
        s.focusEl.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {}
    }
  }

  function cleanupAndClose() {
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();

    if (lastActive && typeof lastActive.focus === "function") {
      try {
        lastActive.focus();
      } catch {}
    }
  }

  function quitWizard() {
    markAllWizardsSeen();
    markThisPageWizardSeen();

    if (typeof opts.onQuit === "function") {
      try {
        opts.onQuit();
      } catch {}
    }

    cleanupAndClose();
  }

  function doneWizard() {
    markAllWizardsSeen();
    markThisPageWizardSeen();

    if (typeof opts.onDone === "function") {
      try {
        opts.onDone();
      } catch {}
    }

    cleanupAndClose();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      quitWizard();
      return;
    }

    // Basic focus trap
    if (e.key === "Tab") {
      const focusables = overlay.querySelectorAll(focusableSelector);
      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  closeBtn.addEventListener("click", quitWizard);
  skipBtn.addEventListener("click", quitWizard);

  backBtn.addEventListener("click", () => {
    if (idx > 0) {
      idx -= 1;
      renderStep();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (idx < steps.length - 1) {
      idx += 1;
      renderStep();
      return;
    }
    doneWizard();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) quitWizard();
  });

  function openWizard() {
    lastActive = document.activeElement;
    document.body.appendChild(overlay);
    renderStep();

    const firstBtn = overlay.querySelector("button");
    if (firstBtn) firstBtn.focus();

    document.addEventListener("keydown", onKeyDown, true);
  }

  return { openWizard };
}

/* =========================================================
   Helpers
========================================================= */
function normalize(s) {
  return String(s ?? "").trim();
}

function safeInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
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

function siteText(v) {
  return v === "on_site" ? "On Site" : "Off Site";
}

function matchesSearch(r, q) {
  if (!q) return true;
  const hay = [
    r.name,
    r.category,
    r.status,
    r.locMain,
    r.locExact,
    r.siteStatus,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

/* =========================================================
   Firestore ops
========================================================= */
async function fetchConsumables() {
  const qy = query(STOCKS_COL, where("type", "==", "consumable"));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function saveConsumable(id, payload) {
  await updateDoc(doc(db, "stocks", id), {
    ...payload,
    type: "consumable",
    updatedAt: serverTimestamp(),
  });
}

async function removeConsumable(id) {
  await deleteDoc(doc(db, "stocks", id));
}

/* =========================================================
   Render
========================================================= */
function renderViewRow(r) {
  const loc = `${escapeHtml(r.locMain ?? "")}<div class="small">${escapeHtml(r.locExact ?? "")}</div>`;
  return `
    <tr data-id="${escapeHtml(r.id)}" data-mode="view">
      <td>${escapeHtml(r.name ?? "")}</td>
      <td>${escapeHtml(r.category ?? "")}</td>
      <td>${escapeHtml(r.status ?? "")}</td>
      <td>${escapeHtml(String(r.quantity ?? 0))}</td>
      <td>${loc}</td>
      <td>${escapeHtml(siteText(r.siteStatus))}</td>
      <td>
        <div class="actions-inline">
          <button class="btn small" data-action="edit">Edit</button>
          <button class="btn small" data-action="delete">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function renderEditRow(r) {
  const statusOptions = CONSUMABLE_STATUS.map(
    (s) =>
      `<option value="${escapeHtml(s)}" ${s === r.status ? "selected" : ""}>${escapeHtml(s)}</option>`
  ).join("");

  const siteOptions = SITE_STATUS.map(
    (s) =>
      `<option value="${s.v}" ${s.v === r.siteStatus ? "selected" : ""}>${s.t}</option>`
  ).join("");

  return `
    <tr class="editing" data-id="${escapeHtml(r.id)}" data-mode="edit">
      <td>
        <input class="cell-input" data-field="name" value="${escapeHtml(r.name ?? "")}" />
      </td>
      <td>
        <input class="cell-input" data-field="category" value="${escapeHtml(r.category ?? "")}" />
      </td>
      <td>
        <select class="cell-select" data-field="status">
          ${statusOptions}
        </select>
      </td>
      <td>
        <input class="cell-input" data-field="quantity" type="number" min="0" value="${escapeHtml(String(r.quantity ?? 0))}" inputmode="numeric" />
      </td>
      <td>
        <div style="display:grid; gap:8px">
          <input class="cell-input" data-field="locMain" value="${escapeHtml(r.locMain ?? "")}" placeholder="Main" />
          <input class="cell-input" data-field="locExact" value="${escapeHtml(r.locExact ?? "")}" placeholder="Exact" />
        </div>
      </td>
      <td>
        <select class="cell-select" data-field="siteStatus">
          ${siteOptions}
        </select>
      </td>
      <td>
        <div class="actions-inline">
          <button class="btn small primary" data-action="save">Save</button>
          <button class="btn small" data-action="cancel">Cancel</button>
        </div>
      </td>
    </tr>
  `;
}

/* =========================================================
   Init
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("consTbody");
  const table = document.getElementById("consTable");
  const search = document.getElementById("searchConsumables");

  // Guard: don’t crash if page structure changes
  if (!tbody || !table || !search) {
    console.warn("Consumable Records: required DOM missing. Script halted.");
    return;
  }

  let cached = [];
  let editingId = null;
  let editingSnapshot = null;

  function render() {
    const q = normalize(search.value);

    const filtered = cached
      .filter((r) => matchesSearch(r, q))
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

    tbody.innerHTML =
      filtered
        .map((r) => (editingId === r.id ? renderEditRow(r) : renderViewRow(r)))
        .join("") ||
      `<tr><td colspan="7" class="small">No consumables found.</td></tr>`;
  }

  async function refresh() {
    try {
      cached = await fetchConsumables();
      render();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="7" class="small">Failed to load (Firestore permissions/network).</td></tr>`;
    }
  }

  /* ---------------------------
     Wizard: new users only (global)
     - If Dashboard was skipped, this won’t run
     - Quit anytime (X / Skip / outside click / ESC)
  ---------------------------- */
  if (shouldShowWizard()) {
    const steps = [
      {
        title: "Welcome to Consumable Records",
        body: "This table lets you edit consumable stock details like status, quantity, and exact location.",
        focusEl: null,
      },
      {
        title: "Search items",
        body: "Use the search bar to quickly filter by name, category, status, or location fields.",
        focusEl: search,
      },
      {
        title: "Edit inline",
        body: "Tap Edit to modify a row. Save applies changes to Firestore; Cancel discards edits.",
        focusEl: null,
      },
      {
        title: "Delete carefully",
        body: "Delete removes the record from Firestore. You’ll be asked to confirm first.",
        focusEl: null,
      },
    ];

    const wiz = createWizardOverlay(steps);
    wiz.openWizard();
  }

  search.addEventListener("input", render);

  table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const tr = btn.closest("tr[data-id]");
    if (!tr) return;

    const id = tr.dataset.id;
    const action = btn.dataset.action;

    const rowData = cached.find((x) => x.id === id);
    if (!rowData) return;

    if (action === "edit") {
      editingId = id;
      editingSnapshot = { ...rowData };
      render();
      return;
    }

    if (action === "cancel") {
      if (editingSnapshot && editingSnapshot.id === id) {
        const idx = cached.findIndex((x) => x.id === id);
        if (idx !== -1) cached[idx] = editingSnapshot;
      }
      editingId = null;
      editingSnapshot = null;
      render();
      return;
    }

    if (action === "delete") {
      if (!confirm("Delete this consumable record?")) return;

      try {
        await removeConsumable(id);
        if (editingId === id) {
          editingId = null;
          editingSnapshot = null;
        }
        await refresh();
      } catch (err) {
        console.error(err);
        alert("Delete failed. (Check Firestore permissions/network.)");
      }
      return;
    }

    if (action === "save") {
      const getVal = (field) => {
        const el = tr.querySelector(`[data-field="${field}"]`);
        return el ? el.value : "";
      };

      const payload = {
        name: normalize(getVal("name")),
        category: normalize(getVal("category")),
        status: getVal("status"),
        quantity: safeInt(getVal("quantity"), rowData.quantity ?? 0),
        locMain: normalize(getVal("locMain")),
        locExact: normalize(getVal("locExact")),
        siteStatus: getVal("siteStatus"),
      };

      if (!payload.name || !payload.category || !payload.locMain || !payload.locExact) {
        alert("Please fill Name, Category, and both Location fields.");
        return;
      }

      if (!CONSUMABLE_STATUS.includes(payload.status)) {
        alert("Invalid consumable status.");
        return;
      }

      if (!["on_site", "off_site"].includes(payload.siteStatus)) {
        alert("Invalid site status.");
        return;
      }

      try {
        await saveConsumable(id, payload);

        // update cached row locally (keep existing fields)
        const idx = cached.findIndex((x) => x.id === id);
        if (idx !== -1) cached[idx] = { ...cached[idx], ...payload };

        editingId = null;
        editingSnapshot = null;
        render();
      } catch (err) {
        console.error(err);
        alert("Save failed. (Check Firestore permissions/network.)");
      }
    }
  });

  refresh();
});
