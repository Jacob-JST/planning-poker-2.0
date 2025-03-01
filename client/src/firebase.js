import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBEodn1kRZNV0u4tZWqY3rxajLa_6UNALs",
  authDomain: "planning-poker-8ec13.firebaseapp.com",
  projectId: "planning-poker-8ec13",
  storageBucket: "planning-poker-8ec13.firebasestorage.app",
  messagingSenderId: "124893850665",
  appId: "1:124893850665:web:bfe1fcfa814ddd7b470038",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider };
