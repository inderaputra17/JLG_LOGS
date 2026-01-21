// /js/communications.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp
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
const COL = collection(db, "communications");

const STATUS_LIST = ["Online", "Offline", "Not in Use", "Spoilt / Decommissioned"];

function normalize(s) {
  return String(s ?? "").trim();
}

// ✅ Return small, CSS-friendly classes
function statusClass(s) {
  return ({
    "Online": "online",
    "Offline": "offline",
    "Not in Use": "notinuse",
    "Spoilt / Decommissioned": "spoilt"
  })[s] || "";
}

function applyStatusClass(selectEl, statusValue) {
  selectEl.classList.remove("online", "offline", "notinuse", "spoilt");
  selectEl.classList.add("status"); // ensure base class exists
  const cls = statusClass(statusValue);
  if (cls) selectEl.classList.add(cls);
}

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
      updatedAt: serverTimestamp()
    });
    return;
  }

  await addDoc(COL, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function loadAll() {
  const snap = await getDocs(COL);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0));
}

function render(rows, tbodyEl) {
  tbodyEl.innerHTML =
    rows.map(r => `
      <tr>
        <td>${Number(r.setNumber) || ""}</td>
        <td>${normalize(r.volunteerRole)}</td>
        <td>${normalize(r.locationOfUse)}</td>
        <td><strong>${normalize(r.callSign)}</strong></td>
        <td>
          <select data-id="${r.id}" class="status ${statusClass(r.status)}">
            ${STATUS_LIST.map(s => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
        <td>
          <button class="btn" data-action="delete" data-id="${r.id}">Delete</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="small">No comms records yet.</td></tr>`;
}

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

  let cached = [];

  async function refresh() {
    try {
      cached = await loadAll();
      render(cached, tbody);

      // ✅ Ensure colours apply even after refresh
      tbody.querySelectorAll("select.status").forEach(sel => {
        applyStatusClass(sel, sel.value);
      });
    } catch (err) {
      console.error("LOAD FAILED:", err);
      tbody.innerHTML = `<tr><td colspan="6" class="small">Failed to load (check Firestore permissions / network).</td></tr>`;
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      setNumber: Number(setNumberEl.value),
      volunteerRole: normalize(volunteerRoleEl.value),
      locationOfUse: normalize(locationOfUseEl.value),
      callSign: normalize(callSignEl.value),
      status: statusEl.value
    };

    if (!payload.setNumber || !payload.volunteerRole || !payload.locationOfUse || !payload.callSign) {
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

  // ✅ Status change: update colour instantly + save
  table.addEventListener("change", async (e) => {
    const sel = e.target.closest("select.status[data-id]");
    if (!sel) return;

    applyStatusClass(sel, sel.value);

    try {
      await updateDoc(doc(db, "communications", sel.dataset.id), {
        status: sel.value,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("STATUS UPDATE FAILED:", err);
      alert("Status update failed. Check console.");
      // fallback refresh to restore correct state
      await refresh();
    }
  });

  // Delete
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
