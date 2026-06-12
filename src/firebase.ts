import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: paste the config snippet from Firebase Console → Project Settings →
// "Your apps" → Add app → Web → register "Slate Desktop".
// These values are not secrets (the security rules are the gate).
const firebaseConfig = {
  apiKey: "AIzaSyC8xhDmedPJOZV_4LvPajMUaukK0GALSlA",
  authDomain: "slate-b245a.firebaseapp.com",
  projectId: "slate-b245a",
  storageBucket: "slate-b245a.firebasestorage.app",
  messagingSenderId: "953528152029",
  appId: "1:953528152029:web:8942cc162aec18901dd034",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
