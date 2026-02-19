// Shared utility functions for date formatting and API operations

const LOAD_DEBUG = true;
const LOAD_DEBUG_TIMEOUT_MS = Number(window.LOAD_DEBUG_TIMEOUT_MS) || 15000;

// Normalize various date representations (Firestore Timestamp, ms, or ISO string) to JS Date
export function normalizeDate(v) {
  if (!v && v !== 0) return null;
  if (typeof v === "object" && v !== null) {
    // Debug: log the object structure to understand what we're receiving
    if (v.seconds !== undefined || v._seconds !== undefined) {
    }
    // Firestore Timestamp instance with toDate() method
    if (typeof v.toDate === "function") {
      try {
        return v.toDate();
      } catch (e) {
        /* fallthrough */
      }
    }
    // Firestore Timestamp serialized to JSON: {seconds: number, nanoseconds: number}
    if (typeof v.seconds === "number") {
      const ms =
        v.seconds * 1000 +
        (typeof v.nanoseconds === "number"
          ? Math.floor(v.nanoseconds / 1e6)
          : 0);
      const d = new Date(ms);
      return isNaN(d) ? null : d;
    }
    // Alternative Firestore serialization: {_seconds: number, _nanoseconds: number}
    if (typeof v._seconds === "number") {
      const ms =
        v._seconds * 1000 +
        (typeof v._nanoseconds === "number"
          ? Math.floor(v._nanoseconds / 1e6)
          : 0);
      const d = new Date(ms);
      return isNaN(d) ? null : d;
    }
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  return null;
}

// Format a JS Date as "MonthName day" e.g. "March 8"
export function formatDate(d) {
  const dt = d instanceof Date ? d : normalizeDate(d);
  if (!dt) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(dt);
}

// Format a range of dates; if only one unique calendar day, return a single date label.
export function formatDateRange(values) {
  if (!values || !values.length) return "";
  const dates = values
    .map((v) => (v instanceof Date ? v : normalizeDate(v)))
    .filter((d) => d instanceof Date && !isNaN(d));
  if (!dates.length) return "";
  const sorted = dates.slice().sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.toDateString() === last.toDateString()) return formatDate(first);
  return `${formatDate(first)} — ${formatDate(last)}`;
}

// Derive an event-level date from its recaps (use earliest recap date if present)
export function getEventDate(ev) {
  if (!ev) return null;
  if (Array.isArray(ev.recaps) && ev.recaps.length) {
    const dates = ev.recaps
      .map((r) => normalizeDate(r && r.date))
      .filter((d) => d instanceof Date && !isNaN(d));
    if (dates.length) {
      // return earliest
      return new Date(Math.min(...dates.map((d) => d.getTime())));
    }
  }
  // fallback to top-level date if it exists
  const top = normalizeDate(ev.date);
  if (top) return top;
  return null;
}

// Human-readable event date label (single day or range).
export function getEventDateText(ev) {
  if (!ev) return "";
  const recapDates = Array.isArray(ev.recaps)
    ? ev.recaps
        .map((r) => normalizeDate(r && r.date))
        .filter((d) => d instanceof Date)
    : [];
  if (recapDates.length) return formatDateRange(recapDates);
  const top = normalizeDate(ev.date);
  return top ? formatDate(top) : "";
}

// Derive an event-level location from its recaps (use first non-empty location if present)
export function getEventLocation(ev) {
  if (!ev) return "";
  if (ev.formatted_address) return String(ev.formatted_address);
  if (Array.isArray(ev.recaps)) {
    for (const r of ev.recaps) {
      if (r && r.location) return String(r.location);
    }
  }
  if (ev.location) return String(ev.location);
  return "";
}

// Get total or subtotal score from a group object
export function getGroupScore(g) {
  if (!g) return null;
  if (Object.prototype.hasOwnProperty.call(g, "total")) return g.total;
  if (Object.prototype.hasOwnProperty.call(g, "subtotal")) return g.subtotal;
  return null;
}

// Debounce helper
export function debounce(fn, wait = 200) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function getApiUrl() {
  if (import.meta.env.DEV) return "http://localhost:8080";
  return window.API_URL;
}

// Fetch collection from API instead of Firebase
export async function fetchCollection(name, opts = {}) {
  try {
    const start = Date.now();
    let watch = null;
    if (LOAD_DEBUG) {
      console.log(`[load-debug] fetchCollection start: ${name}`, { opts });
      watch = setTimeout(() => {
        console.warn(
          `[load-debug] fetchCollection still pending: ${name} after ${LOAD_DEBUG_TIMEOUT_MS}ms`,
          { opts },
        );
      }, LOAD_DEBUG_TIMEOUT_MS);
    }

    const apiUrl = getApiUrl();
    const url = `${apiUrl}/api/${name}`;
    console.log(url);
    const response = await fetch(url);

    if (watch) clearTimeout(watch);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    if (LOAD_DEBUG)
      console.log(
        `[load-debug] fetchCollection done: ${name}`,
        Date.now() - start,
        "ms",
        data.cached ? "(cached)" : "(fresh)",
      );

    // API returns { docs: [...], cached: bool }
    const docs = Array.isArray(data.docs) ? data.docs : [];
    return docs;
  } catch (err) {
    console.error("API read error for", name, err);
    throw err;
  }
}

// Fetch a single document with optional collection fallbacks.
export async function fetchDocument(names, id, opts = {}) {
  const collections = Array.isArray(names) ? names : [names];
  const apiUrl = getApiUrl();
  for (const name of collections) {
    const start = Date.now();
    let watch = null;
    try {
      if (LOAD_DEBUG) {
        console.log(`[load-debug] fetchDocument start: ${name}/${id}`);
        watch = setTimeout(() => {
          console.warn(
            `[load-debug] fetchDocument still pending: ${name}/${id} after ${LOAD_DEBUG_TIMEOUT_MS}ms`,
          );
        }, LOAD_DEBUG_TIMEOUT_MS);
      }

      const url = `${apiUrl}/api/${name}/${encodeURIComponent(id)}`;
      const response = await fetch(url, { signal: opts.signal });
      if (watch) clearTimeout(watch);
      if (!response.ok) continue;
      const doc = await response.json();
      if (doc && doc.id) {
        if (LOAD_DEBUG)
          console.log(
            `[load-debug] fetchDocument done: ${name}/${id}`,
            Date.now() - start,
            "ms",
            doc.cached ? "(cached)" : "(fresh)",
          );
        return doc;
      }
    } catch (err) {
      if (watch) clearTimeout(watch);
      console.warn(`fetchDocument error for ${name}/${id}`, err);
    }
  }
}

// Extract coordinates from an event record.
export function getEventCoordinates(ev) {
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  if (!ev || typeof ev !== "object") return null;
  let lat = null;
  let lng = null;

  if (
    ev.coordinates &&
    typeof ev.coordinates === "object" &&
    !Array.isArray(ev.coordinates)
  ) {
    lat = toNum(ev.coordinates.lat);
    lng = toNum(ev.coordinates.lng || ev.coordinates.long);
  } else if (Array.isArray(ev.coordinates) && ev.coordinates.length >= 2) {
    lat = toNum(ev.coordinates[0]);
    lng = toNum(ev.coordinates[1]);
  }

  if (lat === null || lng === null) {
    lat = toNum(ev.lat ?? ev.latitude);
    lng = toNum(ev.long ?? ev.lng ?? ev.longitude);
  }

  if (lat === null || lng === null) return null;
  const formatted_address = ev.formatted_address || null;
  return { lat, lng, formatted_address };
}

// Helpers for labels used on the event detail page
export function slugify(str) {
  return (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function abbreviateLabel(str) {
  if (!str) return "";
  return str
    .toString()
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
}
