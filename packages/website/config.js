// Configuration for WGI Scoretracker website
// Firebase config is kept for backward compatibility but direct Firestore access is no longer used.
// All data access now goes through the middleman API.

window.firebaseConfig = {
  apiKey: "AIzaSyAGX0TECMiJ3AoEqGD3FTF1dRguFCOt6tI",
  authDomain: "wgiscoreapp.firebaseapp.com",
  projectId: "wgiscoreapp",
  storageBucket: "wgiscoreapp.firebasestorage.app",
  messagingSenderId: "885548072383",
  appId: "1:885548072383:web:8a61e3f014d79f4012750a",
  measurementId: "G-ZPN6HN9510",
};

// API middleman URL (Cloud Run function)
// For local development, use http://localhost:8080
// For production, use your Cloud Run URL
window.API_URL = "https://api.bluetapio.ca"; // Change to Cloud Run URL in production

// Deprecated: API key moved to server-side
// window.GOOGLE_GEOCODE_KEY = "AIzaSyB1UrV-jk3CEv4uyH7f6Uhg_66da8F_w9I";
