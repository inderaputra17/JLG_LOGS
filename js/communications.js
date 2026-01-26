// /js/communications.js
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
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ---------------------------
   Firestore collection
---------------------------- */
const COL = collection(db, "communications");

/* ---------------------------
   Constants / helpers
---------------------------- */
const STATUS_LIST = ["Online", "Offline", "Not in Use", "Spoilt / Decommissioned"];

function normalize(v) {
  return String(v ?? "").trim();
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

function statusClass(s) {
  return ({
    "Online": "online",
    "Offline": "offline",
    "Not in Use": "notinuse",
    "Spoilt / Decommissioned": "spoilt",
  })[s] || "";
}

function applyStatusClass(selectEl, statusValue) {
  selectEl.classList.remove("online", "offline", "notinuse", "spoilt");
  selectEl.classList.add("status");
  const cls = statusClass(statusValue);
  if (cls) selectEl.classList.add(cls);
}

function isValidSetNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0;
}

/* ---------------------------
   Global Wizard System (shared across ALL pages)
   - If user quits/skips on Dashboard, ALL page wizards stop
   - Each page also marks itself seen so it won't repeat
   - Quit anytime: X / Skip / outside click / ESC
   - Uses the same CSS class names as your dashboard wizard
---------------------------- */
const WIZARD_GLOBAL_KEY = "wizard_seen__ALL__v1";
const WIZARD_PAGE_KEY = "wizard_seen__communications__v1";

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
  // If storage is blocked, safest is to NOT show (prevents loops/breakage)
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
  // Reuse existing typography classes if present
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
    // quit once = skip ALL pages from now on
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
    // completing also = no more wizards on other pages
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

    // Focus trap
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

/* ---------------------------
   Firestore ops
---------------------------- */
async function findBySet(setNumber) {
  const qy = query(COL, where("setNumber", "==", Number(setNumber)));
  const snap = await getDocs(qy);
  if (snap.empty) return null;
  return snap.docs[0];
}

async function upsertRadio(data) {
  const existing = await findBySet(data.setNumber);

  if (existing) {
    await updateDoc(existing.ref, {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await addDoc(COL, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function loadAll() {
  const snap = await getDocs(COL);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0));
}

/* ---------------------------
   Render
---------------------------- */
function render(rows, tbodyEl) {
  if (!tbodyEl) return;

  if (!rows || rows.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="6" class="small">No comms records yet.</td></tr>`;
    return;
  }

  tbodyEl.innerHTML = rows
    .map((r) => {
      const setNo = Number(r.setNumber) || "";
      const role = escapeHtml(normalize(r.volunteerRole));
      const loc = escapeHtml(normalize(r.locationOfUse));
      const cs = escapeHtml(normalize(r.callSign));
      const currentStatus = normalize(r.status);

      return `
        <tr>
          <td>${setNo}</td>
          <td>${role}</td>
          <td>${loc}</td>
          <td><strong>${cs}</strong></td>
          <td>
            <select data-id="${escapeHtml(r.id)}" class="status ${statusClass(currentStatus)}">
              ${STATUS_LIST.map((s) => {
                const selected = s === currentStatus ? "selected" : "";
                return `<option ${selected}>${escapeHtml(s)}</option>`;
              }).join("")}
            </select>
          </td>
          <td>
            <button class="btn" data-action="delete" data-id="${escapeHtml(r.id)}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function applyStatusColorsInTbody(tbodyEl) {
  if (!tbodyEl) return;
  tbodyEl.querySelectorAll("select.status").forEach((sel) => {
    applyStatusClass(sel, sel.value);
  });
}

/* ---------------------------
   Init
---------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("radioForm");
  const resetBtn = document.getElementById("resetBtn");
  const table = document.getElementById("radioTable");
  const tbody = document.getElementById("radioTbody");

  const setNumberEl = document.getElementById("setNumber");
  const volunteerRoleEl = document.getElementById("volunteerRole");
  const locationOfUseEl = document.getElementById("locationOfUse");
  const callSignEl = document.getElementById("callSign");
  const statusEl = document.getElementById("status");

  if (
    !form ||
    !resetBtn ||
    !table ||
    !tbody ||
    !setNumberEl ||
    !volunteerRoleEl ||
    !locationOfUseEl ||
    !callSignEl ||
    !statusEl
  ) {
    console.warn("Comms page: required DOM elements missing. Script halted.");
    return;
  }

  async function refresh() {
    try {
      const rows = await loadAll();
      render(rows, tbody);
      applyStatusColorsInTbody(tbody);
    } catch (err) {
      console.error("LOAD FAILED:", err);
      tbody.innerHTML = `<tr><td colspan="6" class="small">Failed to load (check Firestore permissions / network).</td></tr>`;
    }
  }

  /* ---------------------------
     Wizard: new users only (global)
     - If Dashboard was skipped, this won't run
     - Quit anytime
  ---------------------------- */
  if (shouldShowWizard()) {
    const steps = [
      {
        title: "Welcome to Communications",
        body: "Track radio sets, call-signs, locations, and their current status.",
        focusEl: null,
      },
      {
        title: "Add a radio set",
        body: "Fill Set #, Volunteer Role, Location of Use, and Call-Sign, then press Save.",
        focusEl: setNumberEl,
      },
      {
        title: "Update status quickly",
        body: "Change the status pill in the table. It saves automatically.",
        focusEl: null,
      },
      {
        title: "Delete when needed",
        body: "Use Delete to remove a record. You’ll be asked to confirm first.",
        focusEl: null,
      },
    ];

    const wiz = createWizardOverlay(steps);
    wiz.openWizard();
  }

  /* ---------------------------
     Form submit
  ---------------------------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      setNumber: Number(setNumberEl.value),
      volunteerRole: normalize(volunteerRoleEl.value),
      locationOfUse: normalize(locationOfUseEl.value),
      callSign: normalize(callSignEl.value),
      status: statusEl.value,
    };

    if (
      !isValidSetNumber(payload.setNumber) ||
      !payload.volunteerRole ||
      !payload.locationOfUse ||
      !payload.callSign
    ) {
      alert("Please fill Set #, Volunteer Role, Location of Use, and Call-Sign.");
      return;
    }

    try {
      await upsertRadio(payload);
      form.reset();
      await refresh();
    } catch (err) {
      console.error("SAVE FAILED:", err);
      alert("Save failed. Open DevTools Console to see the exact error.");
    }
  });

  resetBtn.addEventListener("click", () => form.reset());

  /* ---------------------------
     Status change: update colour instantly + save
  ---------------------------- */
  table.addEventListener("change", async (e) => {
    const sel = e.target.closest("select.status[data-id]");
    if (!sel) return;

    const prev = sel.dataset.prev || sel.value;
    sel.dataset.prev = sel.value;

    applyStatusClass(sel, sel.value);

    try {
      await updateDoc(doc(db, "communications", sel.dataset.id), {
        status: sel.value,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("STATUS UPDATE FAILED:", err);
      alert("Status update failed. Check console.");

      // Roll back UI if update fails
      sel.value = prev;
      applyStatusClass(sel, sel.value);
    }
  });

  /* ---------------------------
     Delete
  ---------------------------- */
  table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='delete']");
    if (!btn) return;

    const id = btn.dataset.id;
    if (!confirm("Delete this radio set?")) return;

    try {
      await deleteDoc(doc(db, "communications", id));
      await refresh();
    } catch (err) {
      console.error("DELETE FAILED:", err);
      alert("Delete failed. Check console.");
    }
  });

  refresh();
});
