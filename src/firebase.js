import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "service-orch-ch2-3219",
  appId: "1:292077387597:web:fc46d65b7c8a5ae12a4104",
  storageBucket: "service-orch-ch2-3219.firebasestorage.app",
  apiKey: "AIzaSyBS-137S8F_FkQon3jT1yFGSDkv0-Z5di0",
  authDomain: "service-orch-ch2-3219.firebaseapp.com",
  messagingSenderId: "292077387597"
};

let app;
let db = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (error) {
  console.warn("Failed to initialize Firebase SDK:", error);
}

export { db };
