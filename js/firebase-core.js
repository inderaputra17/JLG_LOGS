import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 🔐 YOUR EXISTING CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAwyIghTzxPQ3veDYljtOYZg4b0EiJ5hr4",
  authDomain: "first-aid-app-8ae79.firebaseapp.com",
  projectId: "first-aid-app-8ae79",
  storageBucket: "first-aid-app-8ae79.firebasestorage.app",
  messagingSenderId: "759107374304",
  appId: "1:759107374304:web:efb87e2c55a32e95129485"
};

// INIT
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// COLLECTION REF (auto-created)
const STOCKS = collection(db, "stocks");

// EXPORT API (used by page JS)
window.FirebaseDB = {
  STOCKS,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where
};
