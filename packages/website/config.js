// Configuration for WGI Scoretracker website
// Firebase config is kept for backward compatibility but direct Firestore access is no longer used.
// All data access now goes through the middleman API.

// API middleman URL (Cloud Run function)
// For local development, use http://localhost:8080
// For production, use your Cloud Run URL
window.API_URL = "https://api.bluetapio.ca"; // Change to Cloud Run URL in production
