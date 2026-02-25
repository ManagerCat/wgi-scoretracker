import { initializeApp, cert } from "firebase-admin/app";
import * as Credentials from "./wgiscoreapp-c0f8f08ebe54.json" with { type: "json" };
const ServiceAccount = Credentials.default;
import { getFirestore } from "firebase-admin/firestore";
// process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
initializeApp({
  credential: cert(ServiceAccount),
});

// Initialize Firestore instance
const db = getFirestore();

// In-memory cache with TTL
const cache = new Map();
const geocodeCache = new Map();

const CACHE_TTL = 1000 * 60 * 5; // 5 minutes default
const GEOCODE_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days for geocode results

// Set cache with expiration
function setCache(cacheMap, key, value, ttlMs) {
  cacheMap.set(key, {
    data: value,
    timestamp: Date.now(),
    expires: Date.now() + ttlMs,
  });
}

// Get from cache if not expired
function getCache(cacheMap, key) {
  const entry = cacheMap.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expires) {
    cacheMap.delete(key);
    return null;
  }

  return entry.data;
}

// Set CORS headers on response
function setCorsHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "86400");
}

// Firestore proxy handler
async function handleFirestoreProxy(req, res) {
  const path = req.path || req.url || "";
  const parts = path.replace(/^\/api\//, "").split("/");

  if (parts.length === 0) {
    return res.status(400).json({ error: "Invalid API path" });
  }

  const collectionName = parts[0];
  const cacheKey = `firestore:${req.method}:${path}:${JSON.stringify(req.query)}`;

  // Check cache for GET requests
  if (req.method === "GET") {
    const cached = getCache(cache, cacheKey);
    if (cached) {
      console.log(`Firestore cache hit: ${collectionName}`);
      return res.json({ ...cached, cached: true });
    }
  }

  try {
    // GET /api/collection - list all documents
    if (req.method === "GET" && parts.length === 1) {
      const snapshot = await db.collection(collectionName).get();
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setCache(cache, cacheKey, { docs }, CACHE_TTL);
      return res.json({ docs, cached: false });
    }

    // GET /api/collection/docId - get single document
    if (req.method === "GET" && parts.length === 2) {
      const docId = parts[1];
      const doc = await db.collection(collectionName).doc(docId).get();

      if (!doc.exists) {
        return res.status(404).json({ error: "Document not found" });
      }

      const result = { id: doc.id, ...doc.data() };
      setCache(cache, cacheKey, result, CACHE_TTL);
      return res.json({ ...result, cached: false });
    }

    return res.status(400).json({ error: "Unsupported operation" });
  } catch (error) {
    console.error("Firestore proxy error:", error);
    return res
      .status(500)
      .json({ error: "Database query failed", message: error.message });
  }
}

// Geocoding handler with caching
async function handleGeocode(req, res) {
  const address = req.query.address;

  if (!address) {
    return res.status(400).json({ error: "Address parameter is required" });
  }

  const normalizedAddress = address.trim().toLowerCase();

  // Check cache
  const cached = getCache(geocodeCache, normalizedAddress);
  if (cached) {
    console.log(`Geocode cache hit: ${address}`);
    return res.json({ ...cached, cached: true });
  }

  // Call Google Geocoding API
  const GOOGLE_API_KEY = process.env.GOOGLE_GEOCODE_KEY;
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: "Google API key not configured" });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const result = data.results[0];
      const geocodeResult = {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formatted_address: result.formatted_address,
      };

      // Cache the result
      setCache(
        geocodeCache,
        normalizedAddress,
        geocodeResult,
        GEOCODE_CACHE_TTL,
      );
      console.log(
        `Geocoded: ${address} -> ${geocodeResult.lat}, ${geocodeResult.lng}`,
      );

      return res.json({ ...geocodeResult, cached: false });
    } else {
      console.warn(`Geocode failed for: ${address}, status: ${data.status}`);
      // Cache null result to avoid repeated failed requests
      setCache(
        geocodeCache,
        normalizedAddress,
        { result: null },
        GEOCODE_CACHE_TTL,
      );
      return res.json({ result: null, status: data.status });
    }
  } catch (error) {
    console.error("Geocoding error:", error);
    return res
      .status(500)
      .json({ error: "Geocoding request failed", message: error.message });
  }
}

// Main HTTP endpoint
export const apiGet = async (req, res) => {
  // Set CORS headers
  res.set("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET, POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "3600");
    return res.status(204).send("");
  }

  const path = req.path || req.url || "/";

  // Geocoding endpoint
  if (path === "/geocode") {
    return handleGeocode(req, res);
  }

  // Firestore passthrough endpoints: /api/collection or /api/collection/docId
  if (path.startsWith("/api/")) {
    return handleFirestoreProxy(req, res);
  }

  // Health check
  if (path === "/" || path === "/health") {
    return res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      cacheStats: {
        geocodeEntries: geocodeCache.size,
        firestoreEntries: cache.size,
      },
    });
  }

  return res.status(404).json({ error: "Not found" });
};
