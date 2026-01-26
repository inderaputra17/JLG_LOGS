// /js/firebase-core.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Firebase client config (public in web apps)
 * Keep it ONLY in this file.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyAwyIghTzxPQ3veDYljtOYZg4b0EiJ5hr4',
  authDomain: 'first-aid-app-8ae79.firebaseapp.com',
  projectId: 'first-aid-app-8ae79',
  storageBucket: 'first-aid-app-8ae79.firebasestorage.app',
  messagingSenderId: '759107374304',
  appId: '1:759107374304:web:efb87e2c55a32e95129485',
};

// Initialize once
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
