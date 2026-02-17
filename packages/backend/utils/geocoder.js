// In-memory cache for geocoding results
const geocodeCache = new Map();

/**
 * Normalize an address for consistent cache keys
 * @param {string} address - The address to normalize
 * @returns {string} Normalized address
 */
function normalizeAddress(address) {
  return (address || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Geocode an address using Google Geocoding API with caching
 * @param {string} location - The location/address to geocode
 * @returns {Promise<{lat: number, lng: number, formatted_address: string}|null>} Geocoded result or null if failed
 */
export async function geocodeLocation(location) {
  if (!location || typeof location !== "string") {
    return null;
  }

  const normalized = normalizeAddress(location);

  // Check cache first
  if (geocodeCache.has(normalized)) {
    const cached = geocodeCache.get(normalized);
    console.log(`Geocoder: Cache hit for "${location}"`);
    return cached;
  }

  const apiKey = require("./geocodekey.json").key;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      location,
    )}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `Geocoder: HTTP error ${response.status} for "${location}"`,
      );
      return null;
    }

    const data = await response.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const result = data.results[0];
      const geocoded = {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formatted_address: result.formatted_address,
      };

      // Cache the result
      geocodeCache.set(normalized, geocoded);
      console.log(
        `Geocoder: Successfully geocoded "${location}" -> ${geocoded.lat}, ${geocoded.lng}`,
      );

      return geocoded;
    } else {
      console.warn(
        `Geocoder: Failed to geocode "${location}", status: ${data.status}`,
      );
      // Cache null to avoid repeated failed requests
      geocodeCache.set(normalized, null);
      return null;
    }
  } catch (error) {
    console.error(`Geocoder: Error geocoding "${location}":`, error.message);
    return null;
  }
}

/**
 * Get cache statistics
 * @returns {{size: number}} Cache statistics
 */
export function getGeocodeStats() {
  return {
    size: geocodeCache.size,
  };
}

export default geocodeLocation;
