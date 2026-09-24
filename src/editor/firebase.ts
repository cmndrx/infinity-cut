import {initializeApp} from "firebase/app";
import {getAuth} from "firebase/auth";
import {getFirestore} from "firebase/firestore";
import {getStorage} from "firebase/storage";

// Public web configuration for the shared InfiNFT suite (not a service credential).
const app = initializeApp({
  apiKey: "AIzaSyCNnzfrapK2srzVNlf5YidX8546Wbpzy9Y",
  authDomain: "infinft-card-game.firebaseapp.com",
  projectId: "infinft-card-game",
  storageBucket: "infinft-card-game.firebasestorage.app",
  messagingSenderId: "176088601846",
  appId: "1:176088601846:web:cdb264e83a4f825a5448d7",
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
