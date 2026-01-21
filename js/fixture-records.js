// /js/fixture-records.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
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
const FIXTURE_STATUS = ["Usable", "Damaged", "Missing"];
const SITE_STATUS = [
  { v: "on_site", t: "On Site" },
  { v: "off_site", t: "Off Site" }
];

function normalize(s){ return String(s ?? "").trim(); }
function safeInt(value, fallback = 0){
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function siteText(v){
  return v === "on_site" ? "On Site" : "Off Site";
}
function matchesSearch(r, q){
  if (!q) return true;
  const hay = [
    r.name, r.category, r.status, r.locMain, r.locExact, r.siteStatus
  ].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

async function fetchFixtures(){
  const qy = query(STOCKS_COL, where("type", "==", "fixture"));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveFixture(id, payload){
  await updateDoc(doc(db, "stocks", id), {
    ...payload,
    type: "fixture",
    updatedAt: serverTimestamp(),
  });
}

async function removeFixture(id){
  await deleteDoc(doc(db, "stocks", id));
}

function renderViewRow(r){
  const loc = `${escapeHtml(r.locMain ?? "")}<div class="small">${escapeHtml(r.locExact ?? "")}</div>`;
  return `
    <tr data-id="${r.id}" data-mode="view">
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

function renderEditRow(r){
  const statusOptions = FIXTURE_STATUS.map(s =>
    `<option value="${escapeHtml(s)}" ${s === r.status ? "selected" : ""}>${escapeHtml(s)}</option>`
  ).join("");

  const siteOptions = SITE_STATUS.map(s =>
    `<option value="${s.v}" ${s.v === r.siteStatus ? "selected" : ""}>${s.t}</option>`
  ).join("");

  return `
    <tr class="editing" data-id="${r.id}" data-mode="edit">
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
        <input class="cell-input" data-field="quantity" type="number" min="0" value="${escapeHtml(String(r.quantity ?? 0))}" />
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

document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("fixTbody");
  const table = document.getElementById("fixTable");
  const search = document.getElementById("searchFixtures");

  let cached = [];
  let editingId = null;
  let editingSnapshot = null; // store original row data for cancel

  function render(){
    const q = normalize(search.value);
    const filtered = cached.filter(r => matchesSearch(r, q))
      .sort((a,b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

    tbody.innerHTML = filtered.map(r => {
      if (editingId === r.id) return renderEditRow(r);
      return renderViewRow(r);
    }).join("") || `<tr><td colspan="7" class="small">No fixtures found.</td></tr>`;
  }

  async function refresh(){
    try{
      cached = await fetchFixtures();
      render();
    }catch(err){
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="7" class="small">Failed to load (Firestore permissions/network).</td></tr>`;
    }
  }

  search.addEventListener("input", render);

  table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const tr = btn.closest("tr[data-id]");
    if (!tr) return;

    const id = tr.dataset.id;
    const action = btn.dataset.action;

    const rowData = cached.find(x => x.id === id);
    if (!rowData) return;

    // Only one row can be edited at a time
    if (action === "edit") {
      editingId = id;
      editingSnapshot = { ...rowData };
      render();
      return;
    }

    if (action === "cancel") {
      // restore snapshot into cached (in case user typed & we re-render)
      if (editingSnapshot && editingSnapshot.id === id) {
        const idx = cached.findIndex(x => x.id === id);
        if (idx !== -1) cached[idx] = editingSnapshot;
      }
      editingId = null;
      editingSnapshot = null;
      render();
      return;
    }

    if (action === "delete") {
      if (!confirm("Delete this fixture record?")) return;
      try{
        await removeFixture(id);
        if (editingId === id) {
          editingId = null;
          editingSnapshot = null;
        }
        await refresh();
      }catch(err){
        console.error(err);
        alert("Delete failed. (Check Firestore permissions/network.)");
      }
      return;
    }

    if (action === "save") {
      // collect inline values
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

      if (!FIXTURE_STATUS.includes(payload.status)) {
        alert("Invalid fixture status.");
        return;
      }

      if (!["on_site","off_site"].includes(payload.siteStatus)) {
        alert("Invalid site status.");
        return;
      }

      try{
        await saveFixture(id, payload);

        // update local cache so UI reflects immediately
        const idx = cached.findIndex(x => x.id === id);
        if (idx !== -1) cached[idx] = { ...cached[idx], ...payload };

        editingId = null;
        editingSnapshot = null;
        render();
      }catch(err){
        console.error(err);
        alert("Save failed. (Check Firestore permissions/network.)");
      }
    }
  });

  refresh();
});
