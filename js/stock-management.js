// /js/stock-management.js
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
  serverTimestamp,
  runTransaction,
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

const STOCKS_COL = collection(db, "stocks");

const STATUS = Object.freeze({
  consumable: ["Sustainable", "Low", "Critical", "Damaged", "Missing"],
  fixture: ["Usable", "Damaged", "Missing"],
});

function normalize(s) { return String(s ?? "").trim(); }

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

function siteText(siteStatus) {
  return siteStatus === "on_site" ? "On Site" : "Off Site";
}

function setStatusOptions(selectEl, type) {
  selectEl.innerHTML = "";
  (STATUS[type] || []).forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    selectEl.appendChild(opt);
  });
}

function recordLabel(r) {
  return `${String(r.type).toUpperCase()} — ${r.name} | ${r.category} | Qty ${r.quantity} | ${r.locMain}/${r.locExact} | ${siteText(r.siteStatus)}`;
}

async function fetchAllRecords() {
  const snap = await getDocs(STOCKS_COL);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function matchesSearch(r, q) {
  if (!q) return true;
  const hay = [
    r.type, r.name, r.category, r.status, r.locMain, r.locExact, r.siteStatus
  ].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderAllTable(records, tbodyEl, q) {
  const rows = records
    .filter(r => matchesSearch(r, q))
    .sort((a, b) => {
      // Firestore timestamps are objects, so we fallback to string compare
      const aa = a.updatedAt?.seconds ? a.updatedAt.seconds : 0;
      const bb = b.updatedAt?.seconds ? b.updatedAt.seconds : 0;
      return bb - aa;
    })
    .map(r => {
      const loc = `${escapeHtml(r.locMain)}<div class="small">${escapeHtml(r.locExact)}</div>`;
      return `
        <tr>
          <td><span class="pill">${escapeHtml(r.type)}</span></td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.category)}</td>
          <td>${escapeHtml(r.status)}</td>
          <td>${escapeHtml(String(r.quantity ?? 0))}</td>
          <td>${loc}</td>
          <td>${escapeHtml(siteText(r.siteStatus))}</td>
          <td>
            <button class="btn" data-action="edit" data-id="${r.id}">Edit</button>
            <button class="btn" data-action="delete" data-id="${r.id}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbodyEl.innerHTML = rows || `<tr><td colspan="8" class="small">No records found.</td></tr>`;
}

function refreshTransferSelect(records, selectEl) {
  const current = selectEl.value;
  selectEl.innerHTML = "";

  records
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = recordLabel(r);
      selectEl.appendChild(opt);
    });

  if (current && records.some(r => r.id === current)) {
    selectEl.value = current;
  }
}

// Find exact match record for MERGE (same item + same location fields)
async function findExactRecordId({ type, name, category, status, locMain, locExact, siteStatus }) {
  // Firestore allows multiple where filters; this will work if rules allow reading.
  const q = query(
    STOCKS_COL,
    where("type", "==", type),
    where("name", "==", name),
    where("category", "==", category),
    where("status", "==", status),
    where("locMain", "==", locMain),
    where("locExact", "==", locExact),
    where("siteStatus", "==", siteStatus)
  );

  const snap = await getDocs(q);
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

async function transferLocation({ fromId, toLocMain, toLocExact, toSiteStatus, qtyRaw }) {
  const sourceRef = doc(db, "stocks", fromId);

  await runTransaction(db, async (tx) => {
    const sourceSnap = await tx.get(sourceRef);
    if (!sourceSnap.exists()) throw new Error("Source record not found");

    const source = sourceSnap.data();
    const sourceQty = safeInt(source.quantity, 0);

    const transferAll = normalize(qtyRaw) === "";
    const transferQty = transferAll ? sourceQty : safeInt(qtyRaw, 0);

    if (!transferAll && transferQty <= 0) throw new Error("Transfer quantity must be > 0");
    if (transferQty > sourceQty) throw new Error("Transfer quantity exceeds source qty");

    // Destination record = same item fields, new location fields
    const destPayload = {
      type: source.type,
      name: source.name,
      category: source.category,
      status: source.status,
      locMain: normalize(toLocMain),
      locExact: normalize(toLocExact),
      siteStatus: toSiteStatus,
    };

    // Find destination doc by querying outside transaction isn't ideal, but in web SDK
    // we can do a query and then transaction update based on returned ref id.
    const destId = await findExactRecordId(destPayload);

    // Update source quantity
    tx.update(sourceRef, {
      quantity: sourceQty - transferQty,
      updatedAt: serverTimestamp(),
    });

    if (destId) {
      const destRef = doc(db, "stocks", destId);
      const destSnap = await tx.get(destRef);
      const dest = destSnap.exists() ? destSnap.data() : null;
      const destQty = safeInt(dest?.quantity, 0);

      tx.update(destRef, {
        quantity: destQty + transferQty,
        updatedAt: serverTimestamp(),
      });
    } else {
      const newDestRef = doc(STOCKS_COL); // auto-id
      tx.set(newDestRef, {
        ...destPayload,
        quantity: transferQty,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Elements
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

  // Setup status options
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

  // Add / merge
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      type: typeEl.value,
      name: normalize(document.getElementById("name").value),
      category: normalize(document.getElementById("category").value),
      status: statusEl.value,
      quantity: safeInt(document.getElementById("qty").value, 0),
      locMain: normalize(document.getElementById("locMain").value),
      locExact: normalize(document.getElementById("locExact").value),
      siteStatus: document.getElementById("siteStatus").value,
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

  searchAll.addEventListener("input", () => {
    renderAllTable(cachedRecords, allTbody, normalize(searchAll.value));
  });

  // Table actions (edit/delete)
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
      const r = cachedRecords.find(x => x.id === id);
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

  // Save edit
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = normalize(editIdEl.value);
    if (!id) {
      alert("No record selected to edit.");
      return;
    }

    const payload = {
      type: editTypeEl.value,
      name: normalize(document.getElementById("editName").value),
      category: normalize(document.getElementById("editCategory").value),
      status: editStatusEl.value,
      quantity: safeInt(document.getElementById("editQty").value, 0),
      locMain: normalize(document.getElementById("editLocMain").value),
      locExact: normalize(document.getElementById("editLocExact").value),
      siteStatus: document.getElementById("editSiteStatus").value,
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

  // Transfer
  transferForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fromId = fromRecordEl.value;
    const toLocMain = document.getElementById("toLocMain").value;
    const toLocExact = document.getElementById("toLocExact").value;
    const toSiteStatus = document.getElementById("toSiteStatus").value;
    const qtyRaw = document.getElementById("transferQty").value;

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

  // Initial
  refreshUI();
});
