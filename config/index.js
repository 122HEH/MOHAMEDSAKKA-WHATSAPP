// Import the functions you need from the SDKs you need
import app from "firebase/compat/app"; // compat pour version 9
import "firebase/compat/auth";
import "firebase/compat/database";
import "firebase/compat/storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional


const firebaseApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "";
if (!firebaseApiKey) {
  console.warn(
    "Missing EXPO_PUBLIC_FIREBASE_API_KEY in .env.local. Firebase Auth will fail until it is set."
  );
}

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: "sakkamohamedwhatsapp.firebaseapp.com",
  projectId: "sakkamohamedwhatsapp",
  databaseURL: "https://sakkamohamedwhatsapp-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "sakkamohamedwhatsapp.firebasestorage.app",
  messagingSenderId: "888323469890",
  appId: "1:888323469890:web:6b5e0771b651fa726c73db",
  measurementId: "G-SSH8VK6CY3"
};

// Initialize Firebase (reuse existing default app during Metro Fast Refresh)
const firebase = app.apps.length ? app.app() : app.initializeApp(firebaseConfig);
export default firebase;


import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY in .env.local. Storage uploads will fail."
  );
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export { supabase };

