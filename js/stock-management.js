// /js/stock-management.js
import { db } from "./firebase-core.js";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   Firestore collection
========================================================= */
const STOCKS_COL = collection(db, "stocks");

/* =========================================================
   Constants
========================================================= */
const STATUS = Object.freeze({
  consumable: ["Sustainable", "Low", "Critical", "Damaged", "Missing"],
  fixture: ["Usable", "Damaged", "Missing"],
});

/* =========================================================
   Wizard (GLOBAL across all pages)
   - Dashboard skip/quit = all pages skip
   - This page marks itself seen so it won’t repeat here
   - Quit anytime: X / Skip / outside click / ESC
   - Uses same CSS class names as dashboard wizard (wizard-overlay/card/actions etc.)
========================================================= */
const WIZARD_GLOBAL_KEY = "wizard_seen__ALL__v1";
const WIZARD_PAGE_KEY = "wizard_seen__stock_management__v1";

function safeLocalGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {
    // ignore
  }
}

function safeSessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, val) {
  try {
    sessionStorage.setItem(key, val);
  } catch {
    // ignore
  }
}

function markAllWizardsSeen() {
  safeLocalSet(WIZARD_GLOBAL_KEY, "1");
  safeSessionSet(WIZARD_GLOBAL_KEY, "1");
}

function markThisPageWizardSeen() {
  safeLocalSet(WIZARD_PAGE_KEY, "1");
  safeSessionSet(WIZARD_PAGE_KEY, "1");
}

function shouldShowWizard() {
  // If storage is blocked, safest: do not show (prevents loops/broken overlays)
  const gl = safeLocalGet(WIZARD_GLOBAL_KEY);
  const pl = safeLocalGet(WIZARD_PAGE_KEY);
  const gs = safeSessionGet(WIZARD_GLOBAL_KEY);
  const ps = safeSessionGet(WIZARD_PAGE_KEY);

  const storageBlocked = gl === null && pl === null && gs === null && ps === null;
  if (storageBlocked) return false;

  const globalSeen = gl === "1" || gs === "1";
  const pageSeen = pl === "1" || ps === "1";
  return !globalSeen && !pageSeen;
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
    document.body.style.overflow = "";

    if (lastActive && typeof lastActive.focus === "function") {
      try {
        lastActive.focus();
      } catch {}
    }
  }

  function quitWizard() {
    // Quitting once means skipping all page wizards
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
    document.body.style.overflow = "hidden";
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
  const n = Number.parseInt(String(value), 10);
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

function siteText(siteStatus) {
  return siteStatus === "on_site" ? "On Site" : "Off Site";
}

function setStatusOptions(selectEl, type) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  (STATUS[type] || []).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    selectEl.appendChild(opt);
  });
}

function recordLabel(r) {
  const t = String(r.type || "").toUpperCase();
  return `${t} — ${r.name} | ${r.category} | Qty ${r.quantity} | ${r.locMain}/${r.locExact} | ${siteText(
    r.siteStatus
  )}`;
}

async function fetchAllRecords() {
  const snap = await getDocs(STOCKS_COL);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function matchesSearch(r, q) {
  if (!q) return true;
  const hay = [
    r.type,
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

function renderAllTable(records, tbodyEl, q) {
  if (!tbodyEl) return;

  const rows = records
    .filter((r) => matchesSearch(r, q))
    .sort((a, b) => {
      const aa = a.updatedAt?.seconds ? a.updatedAt.seconds : 0;
      const bb = b.updatedAt?.seconds ? b.updatedAt.seconds : 0;
      return bb - aa;
    })
    .map((r) => {
      const locMain = escapeHtml(r.locMain ?? "");
      const locExact = escapeHtml(r.locExact ?? "");
      const loc = `${locMain}<div class="small">${locExact}</div>`;

      return `
        <tr>
          <td><span class="pill">${escapeHtml(r.type ?? "")}</span></td>
          <td>${escapeHtml(r.name ?? "")}</td>
          <td>${escapeHtml(r.category ?? "")}</td>
          <td>${escapeHtml(r.status ?? "")}</td>
          <td>${escapeHtml(String(r.quantity ?? 0))}</td>
          <td>${loc}</td>
          <td>${escapeHtml(siteText(r.siteStatus))}</td>
          <td>
            <button class="btn" data-action="edit" data-id="${escapeHtml(r.id)}">Edit</button>
            <button class="btn" data-action="delete" data-id="${escapeHtml(r.id)}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbodyEl.innerHTML = rows || `<tr><td colspan="8" class="small">No records found.</td></tr>`;
}

function refreshTransferSelect(records, selectEl) {
  if (!selectEl) return;

  const current = selectEl.value;
  selectEl.innerHTML = "";

  records
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = recordLabel(r);
      selectEl.appendChild(opt);
    });

  if (current && records.some((r) => r.id === current)) {
    selectEl.value = current;
  }
}

/* =========================================================
   Merge helpers
========================================================= */
async function findExactRecordId({
  type,
  name,
  category,
  status,
  locMain,
  locExact,
  siteStatus,
}) {
  const qy = query(
    STOCKS_COL,
    where("type", "==", type),
    where("name", "==", name),
    where("category", "==", category),
    where("status", "==", status),
    where("locMain", "==", locMain),
    where("locExact", "==", locExact),
    where("siteStatus", "==", siteStatus)
  );

  const snap = await getDocs(qy);
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function addOrMergeRecord(payload) {
  const existingId = await findExactRecordId(payload);

  if (existingId) {
    const ref = doc(db, "stocks", existingId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;

      const cur = snap.data();
      const curQty = safeInt(cur.quantity, 0);
      const addQty = safeInt(payload.quantity, 0);

      tx.update(ref, {
        quantity: curQty + addQty,
        updatedAt: serverTimestamp(),
      });
    });

    return;
  }

  await addDoc(STOCKS_COL, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function deleteRecord(id) {
  await deleteDoc(doc(db, "stocks", id));
}

async function updateRecord(id, payload) {
  await updateDoc(doc(db, "stocks", id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

/* =========================================================
   Transfer
   FIX: no query inside transaction
========================================================= */
async function transferLocation({ fromId, toLocMain, toLocExact, toSiteStatus, qtyRaw }) {
  const sourceRef = doc(db, "stocks", fromId);

  const destLocMain = normalize(toLocMain);
  const destLocExact = normalize(toLocExact);

  // Pre-read source using a small transaction (read-only)
  const sourceData = await runTransaction(db, async (tx) => {
    const snap = await tx.get(sourceRef);
    if (!snap.exists()) throw new Error("Source record not found");
    return snap.data();
  });

  const sourceQty = safeInt(sourceData.quantity, 0);

  const transferAll = normalize(qtyRaw) === "";
  const transferQty = transferAll ? sourceQty : safeInt(qtyRaw, 0);

  if (!transferAll && transferQty <= 0) throw new Error("Transfer quantity must be > 0");
  if (transferQty > sourceQty) throw new Error("Transfer quantity exceeds source qty");

  const destKey = {
    type: sourceData.type,
    name: sourceData.name,
    category: sourceData.category,
    status: sourceData.status,
    locMain: destLocMain,
    locExact: destLocExact,
    siteStatus: toSiteStatus,
  };

  const destId = await findExactRecordId(destKey);

  await runTransaction(db, async (tx) => {
    const srcSnap = await tx.get(sourceRef);
    if (!srcSnap.exists()) throw new Error("Source record not found");

    const src = srcSnap.data();
    const srcQtyNow = safeInt(src.quantity, 0);

    const transferQtyNow = transferAll ? srcQtyNow : transferQty;
    if (!transferAll && transferQtyNow <= 0) throw new Error("Transfer quantity must be > 0");
    if (transferQtyNow > srcQtyNow) throw new Error("Transfer quantity exceeds source qty");

    // Update source
    tx.update(sourceRef, {
      quantity: srcQtyNow - transferQtyNow,
      updatedAt: serverTimestamp(),
    });

    if (destId) {
      const destRef = doc(db, "stocks", destId);
      const destSnap = await tx.get(destRef);
      const dest = destSnap.exists() ? destSnap.data() : null;
      const destQty = safeInt(dest?.quantity, 0);

      tx.update(destRef, {
        quantity: destQty + transferQtyNow,
        updatedAt: serverTimestamp(),
      });
    } else {
      const newDestRef = doc(STOCKS_COL); // auto-id
      tx.set(newDestRef, {
        ...destKey,
        quantity: transferQtyNow,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/* =========================================================
   DOM / UI
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const addForm = document.getElementById("addForm");
  const resetBtn = document.getElementById("resetBtn");

  const typeEl = document.getElementById("type");
  const statusEl = document.getElementById("status");

  const allTbody = document.getElementById("allTbody");
  const searchAll = document.getElementById("searchAll");
  const allTable = document.getElementById("allTable");

  const editForm = document.getElementById("editForm");
  const cancelEditBtn = document.getElementById("cancelEditBtn");

  const editIdEl = document.getElementById("editId");
  const editTypeEl = document.getElementById("editType");
  const editStatusEl = document.getElementById("editStatus");

  const transferForm = document.getElementById("transferForm");
  const clearTransferBtn = document.getElementById("clearTransferBtn");
  const fromRecordEl = document.getElementById("fromRecord");

  // Guard: avoid crashes if HTML changes
  if (
    !addForm ||
    !resetBtn ||
    !typeEl ||
    !statusEl ||
    !allTbody ||
    !searchAll ||
    !allTable ||
    !editForm ||
    !cancelEditBtn ||
    !editIdEl ||
    !editTypeEl ||
    !editStatusEl ||
    !transferForm ||
    !clearTransferBtn ||
    !fromRecordEl
  ) {
    console.warn("Stock Management: required DOM missing. Script halted.");
    return;
  }

  /* ---------------------------
     Wizard: new users only (global)
     - If Dashboard was skipped, this won’t run
     - Quit anytime
  ---------------------------- */
  if (shouldShowWizard()) {
    const steps = [
      {
        title: "Welcome to Stock Management",
        body: "This page is where you add, edit, delete, and transfer stock records (Consumables + Fixtures).",
        focusEl: null,
      },
      {
        title: "Add a record",
        body: "Choose a Type, fill Name/Category/Location, then Save. If an identical record exists, quantity will merge automatically.",
        focusEl: addForm,
      },
      {
        title: "Search + review",
        body: "Use the search field to filter your records. The table shows type, status, quantity, and location.",
        focusEl: searchAll,
      },
      {
        title: "Edit / delete from the table",
        body: "Tap Edit to load that row into the Edit form. Delete removes the record from Firestore (confirmation required).",
        focusEl: allTable,
      },
      {
        title: "Transfer stock (location change)",
        body: "Transfer moves quantity from one record to a different location. Leave quantity blank to transfer all.",
        focusEl: transferForm,
      },
    ];

    createWizardOverlay(steps).openWizard();
  }

  /* ---------------------------
     Status select options
  ---------------------------- */
  setStatusOptions(statusEl, typeEl.value);
  typeEl.addEventListener("change", () => setStatusOptions(statusEl, typeEl.value));

  setStatusOptions(editStatusEl, editTypeEl.value);
  editTypeEl.addEventListener("change", () => setStatusOptions(editStatusEl, editTypeEl.value));

  let cachedRecords = [];

  async function refreshUI() {
    try {
      cachedRecords = await fetchAllRecords();
      renderAllTable(cachedRecords, allTbody, normalize(searchAll.value));
      refreshTransferSelect(cachedRecords, fromRecordEl);
    } catch (err) {
      console.error(err);
      allTbody.innerHTML = `<tr><td colspan="8" class="small">Failed to load records (Firestore permissions/network).</td></tr>`;
    }
  }

  /* ---------------------------
     Add / merge
  ---------------------------- */
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      type: typeEl.value,
      name: normalize(document.getElementById("name")?.value),
      category: normalize(document.getElementById("category")?.value),
      status: statusEl.value,
      quantity: safeInt(document.getElementById("qty")?.value, 0),
      locMain: normalize(document.getElementById("locMain")?.value),
      locExact: normalize(document.getElementById("locExact")?.value),
      siteStatus: document.getElementById("siteStatus")?.value,
    };

    if (!payload.name || !payload.category || !payload.locMain || !payload.locExact) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      await addOrMergeRecord(payload);
      addForm.reset();
      setStatusOptions(statusEl, typeEl.value);
      await refreshUI();
    } catch (err) {
      console.error(err);
      alert("Failed to add/merge record. (Check Firestore permissions/network.)");
    }
  });

  resetBtn.addEventListener("click", () => {
    addForm.reset();
    setStatusOptions(statusEl, typeEl.value);
  });

  /* ---------------------------
     Search
  ---------------------------- */
  searchAll.addEventListener("input", () => {
    renderAllTable(cachedRecords, allTbody, normalize(searchAll.value));
  });

  /* ---------------------------
     Table actions (edit/delete)
  ---------------------------- */
  allTable.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id) return;

    if (action === "delete") {
      if (!confirm("Delete this record?")) return;
      try {
        await deleteRecord(id);
        await refreshUI();
      } catch (err) {
        console.error(err);
        alert("Failed to delete. (Check Firestore permissions/network.)");
      }
      return;
    }

    if (action === "edit") {
      const r = cachedRecords.find((x) => x.id === id);
      if (!r) return;

      editIdEl.value = r.id;
      editTypeEl.value = r.type;

      setStatusOptions(editStatusEl, editTypeEl.value);

      document.getElementById("editName").value = r.name ?? "";
      document.getElementById("editCategory").value = r.category ?? "";
      editStatusEl.value = r.status ?? STATUS[editTypeEl.value]?.[0] ?? "";
      document.getElementById("editQty").value = r.quantity ?? 0;
      document.getElementById("editLocMain").value = r.locMain ?? "";
      document.getElementById("editLocExact").value = r.locExact ?? "";
      document.getElementById("editSiteStatus").value = r.siteStatus ?? "on_site";

      editForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  /* ---------------------------
     Save edit
  ---------------------------- */
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = normalize(editIdEl.value);
    if (!id) {
      alert("No record selected to edit.");
      return;
    }

    const payload = {
      type: editTypeEl.value,
      name: normalize(document.getElementById("editName")?.value),
      category: normalize(document.getElementById("editCategory")?.value),
      status: editStatusEl.value,
      quantity: safeInt(document.getElementById("editQty")?.value, 0),
      locMain: normalize(document.getElementById("editLocMain")?.value),
      locExact: normalize(document.getElementById("editLocExact")?.value),
      siteStatus: document.getElementById("editSiteStatus")?.value,
    };

    if (!payload.name || !payload.category || !payload.locMain || !payload.locExact) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      await updateRecord(id, payload);
      editForm.reset();
      editIdEl.value = "";
      setStatusOptions(editStatusEl, editTypeEl.value);
      await refreshUI();
    } catch (err) {
      console.error(err);
      alert("Failed to update record. (Check Firestore permissions/network.)");
    }
  });

  cancelEditBtn.addEventListener("click", () => {
    editForm.reset();
    editIdEl.value = "";
    setStatusOptions(editStatusEl, editTypeEl.value);
  });

  /* ---------------------------
     Transfer
  ---------------------------- */
  transferForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fromId = fromRecordEl.value;
    const toLocMain = document.getElementById("toLocMain")?.value;
    const toLocExact = document.getElementById("toLocExact")?.value;
    const toSiteStatus = document.getElementById("toSiteStatus")?.value;
    const qtyRaw = document.getElementById("transferQty")?.value;

    if (!fromId) {
      alert("Select a source record.");
      return;
    }
    if (!normalize(toLocMain) || !normalize(toLocExact)) {
      alert("Please fill destination location.");
      return;
    }

    try {
      await transferLocation({ fromId, toLocMain, toLocExact, toSiteStatus, qtyRaw });
      transferForm.reset();
      await refreshUI();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Transfer failed. (Check Firestore permissions/network.)");
    }
  });

  clearTransferBtn.addEventListener("click", () => transferForm.reset());

  /* ---------------------------
     Initial
  ---------------------------- */
  refreshUI();
});
