import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import {
  fetchCollection,
  formatDateRange,
  getEventCoordinates,
  getEventDateText,
  getEventLocation,
} from "../utils";

// Cache for circuit colors loaded from config
let circuitColorsCache = null;

// Dynamically load Leaflet CSS/JS and return the global L object
async function loadLeaflet() {
  if (window.L) return window.L;

  const cssHref = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    await new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      link.crossOrigin = "";
      link.onload = resolve;
      link.onerror = resolve; // Continue even if CSS fails
      document.head.appendChild(link);
    });
  }

  const src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  if (!document.querySelector(`script[src="${src}"]`)) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load Leaflet"));
      document.head.appendChild(s);
    });
  }

  // Wait for window.L to be available (with timeout)
  const maxAttempts = 50; // 5 seconds max
  for (let i = 0; i < maxAttempts; i++) {
    if (window.L) return window.L;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Leaflet failed to initialize");
}

function getCircuitColor(circuit) {
  if (!circuit) return "#4B5563";

  // Return cached colors if available
  if (circuitColorsCache) {
    const key = String(circuit).trim().toUpperCase();
    const colorEntry = circuitColorsCache.find(
      (c) => c.name.toUpperCase() === key,
    );
    const color = colorEntry ? colorEntry.color : "#4B5563";
    // console.log(`[getCircuitColor] Circuit: ${circuit}, Key: ${key}, Color: ${color}, Found: ${!!colorEntry}`);
    return color;
  }

  console.log(
    `[getCircuitColor] Circuit: ${circuit}, Cache not loaded yet, returning default`,
  );
  return "#4B5563";
}

function getPinIcon(L, hexColor) {
  const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 36'>
        <path d='M12 0C7 0 3.5 3.5 3.5 8.5 3.5 16.5 12 28 12 28s8.5-11.5 8.5-19.5C20.5 3.5 17 0 12 0z' fill='${hexColor}' stroke='#ffffff' stroke-width='1'/>
        <circle cx='12' cy='8.5' r='3.2' fill='#ffffff' />
      </svg>`;
  const url = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  return L.icon({
    iconUrl: url,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -30],
    className: "map-pin-icon",
  });
}

export default function MapPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [circuitFilter, setCircuitFilter] = useState("");
  const [leafletReady, setLeafletReady] = useState(false);
  const [searchParams] = useSearchParams();

  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const markersById = useRef(new Map());

  // Load circuit colors from config.json
  useEffect(() => {
    async function loadConfig() {
      try {
        console.log("[loadConfig] Starting to load config.json");
        const response = await fetch("/config.json");
        console.log("[loadConfig] Fetch response status:", response.status);
        if (!response.ok) {
          throw new Error(`Failed to load config: ${response.statusText}`);
        }
        const config = await response.json();
        console.log("[loadConfig] Config loaded:", config);
        if (config.circuits && Array.isArray(config.circuits)) {
          circuitColorsCache = config.circuits;
          console.log(
            "[loadConfig] Circuit colors cache populated:",
            circuitColorsCache,
          );
        } else {
          console.log("[loadConfig] No circuits array found in config");
        }
      } catch (err) {
        console.error("Could not load circuit colors from config.json:", err);
      }
    }
    loadConfig();
  }, []);

  useEffect(() => {
    let mounted = true;
    let mapInstance = null;

    async function initMap() {
      try {
        console.log("[initMap] Starting map initialization");
        const L = await loadLeaflet();
        console.log("[initMap] Leaflet loaded successfully");
        if (!mounted) return;

        // Wait a bit more to ensure CSS and DOM are ready
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!mounted) return;

        // Retry logic to find container and ensure it's ready
        let container = null;
        let attempts = 0;
        const maxAttempts = 30; // 1.5 seconds total

        while (attempts < maxAttempts) {
          container = document.getElementById("map");
          if (
            container &&
            container.offsetWidth > 0 &&
            container.offsetHeight > 0
          ) {
            console.log(
              "[initMap] Container ready:",
              container.offsetWidth,
              "x",
              container.offsetHeight,
            );
            break;
          }
          if (attempts === 0) {
            console.log("[initMap] Container not ready yet, waiting...");
          }
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (
          !container ||
          container.offsetWidth === 0 ||
          container.offsetHeight === 0
        ) {
          const msg = `Map container check failed: exists=${!!container}, dims=${container ? container.offsetWidth + "x" + container.offsetHeight : "N/A"}`;
          setError("Map container not ready");
          console.error("[initMap]", msg);
          return;
        }

        console.log(
          "[initMap] Map container validated after",
          attempts,
          "attempts, creating instance",
        );

        if (!mounted) return;

        // Remove any existing Leaflet instance
        if (container._leaflet_id) {
          console.log("[initMap] Removing existing Leaflet instance");
          delete container._leaflet_id;
        }

        // Create map with error handling
        console.log(
          "[initMap] Creating Leaflet map instance with container validation",
        );

        // Final validation: container exists, is in DOM, and has dimensions
        if (
          !container ||
          !document.body.contains(container) ||
          container.offsetWidth === 0 ||
          container.offsetHeight === 0
        ) {
          const msg = `Map container invalid before L.map(): exists=${!!container}, inDOM=${container ? document.body.contains(container) : false}, dims=${container ? container.offsetWidth + "x" + container.offsetHeight : "N/A"}`;
          console.error("[initMap]", msg);
          setError("Map container not ready");
          return;
        }

        console.log(
          "[initMap] Final container validation passed, calling L.map()",
        );

        try {
          mapInstance = L.map(container, {
            center: [39.5, -98.35],
            zoom: 4,
            scrollWheelZoom: true,
            tap: false,
          });
        } catch (mapErr) {
          console.error("[initMap] Failed to create map instance:", mapErr);
          throw mapErr;
        }

        console.log("[initMap] Map instance created successfully");

        // Verify map instance is valid before adding layers
        if (!mapInstance || typeof mapInstance.addLayer !== "function") {
          throw new Error("Map instance is invalid");
        }

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(mapInstance);

        const layer = L.layerGroup().addTo(mapInstance);

        if (!mounted) {
          mapInstance.remove();
          return;
        }

        mapRef.current = mapInstance;
        markersRef.current = layer;
        setLeafletReady(true);
        console.log("[initMap] Map initialization complete");

        // Ensure map container is visible
        const mapContainer = document.getElementById("map");
        if (mapContainer) {
          mapContainer.style.backgroundColor = "white";
          mapContainer.style.opacity = "1";
        }

        // Invalidate size to ensure proper rendering
        setTimeout(() => {
          if (mounted && mapInstance) {
            try {
              mapInstance.invalidateSize(true);
              console.log("[initMap] Map size invalidated");
            } catch (e) {
              console.warn("Error invalidating size:", e);
            }
          }
        }, 100);
      } catch (e) {
        if (mounted) {
          setError(e.message || "Failed to load map library.");
          console.error("[initMap] Map initialization error:", e);
        }
      }
    }

    initMap();

    return () => {
      mounted = false;
      setLeafletReady(false);

      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (e) {
          console.warn("Error removing map:", e);
        }
      }

      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    async function loadEvents() {
      try {
        console.log("[loadEvents] Starting to load events");
        const names = ["events", "event"];
        let docs = [];
        for (const name of names) {
          try {
            docs = await fetchCollection(name);
            if (docs.length) {
              console.log(
                `[loadEvents] Loaded ${docs.length} events from collection "${name}"`,
              );
              break;
            }
          } catch (e) {
            console.warn("Could not fetch", name, e);
          }
        }
        setEvents(docs);
        console.log(
          "[loadEvents] Events state updated with",
          docs.length,
          "events",
        );
      } catch (err) {
        setError(err.message || "Failed to load events.");
        console.error("[loadEvents] Error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  // Add markers whenever events change and Leaflet is ready
  useEffect(() => {
    console.log(
      "[markers effect] leafletReady:",
      leafletReady,
      "events count:",
      events.length,
    );
    console.log(
      "[markers effect] mapRef.current:",
      !!mapRef.current,
      "markersRef.current:",
      !!markersRef.current,
    );
    if (!leafletReady || !mapRef.current || !markersRef.current) {
      console.log(
        "[markers effect] Skipping - leafletReady:",
        leafletReady,
        "mapRef:",
        !!mapRef.current,
        "markersRef:",
        !!markersRef.current,
      );
      return;
    }

    console.log("[markers effect] window.L available:", !!window.L);
    const L = window.L;
    if (!L) {
      console.error("[markers effect] window.L is not available!");
      return;
    }

    markersRef.current.clearLayers();
    markersById.current.clear();
    console.log(`[markers effect] Adding ${events.length} markers`);

    events.forEach((ev) => {
      const id = ev.id || ev._id || ev.key;
      const coords = getEventCoordinates(ev);
      if (!coords) {
        console.log(`[markers effect] No coords for event ${id}`, ev);
        return;
      }
      console.log(`[markers effect] Got coords for ${id}:`, coords);
      console.log(`[markers effect] Got coords for ${id}:`, coords);
      const m = L.marker([coords.lat, coords.lng], {
        icon: getPinIcon(L, getCircuitColor(ev.circuit)),
      }).addTo(markersRef.current);
      console.log(`[markers effect] Added marker for ${id}`);

      const title = ev.circuit
        ? `${ev.circuit}: ${ev.name || ev.id}`
        : ev.name || ev.id;
      const dateText = getEventDateText(ev);
      const locText = coords.formatted_address || getEventLocation(ev) || "";

      let popup = `<div style="font-weight:600">${title}</div>`;
      if (dateText || locText) {
        popup += `<div style="color:#444;font-size:12px">${dateText}${
          dateText && locText ? " — " : ""
        }${locText}</div>`;
      }

      popup += `<div style="margin-top:8px"><a href="event/${encodeURIComponent(
        id,
      )}">Open event</a></div>`;
      m.bindPopup(popup);
      markersById.current.set(String(id), m);
    });

    const all = markersRef.current.getLayers();
    if (all.length) {
      try {
        mapRef.current.fitBounds(L.featureGroup(all).getBounds().pad(0.2));
      } catch (e) {
        /* ignore fit errors */
      }
    }
  }, [events, leafletReady]);

  // Center on ?center=<id> once markers are ready
  useEffect(() => {
    if (!leafletReady) return;
    const centerId = searchParams.get("center");
    if (!centerId) return;
    const m = markersById.current.get(String(centerId));
    if (m && typeof m.getLatLng === "function") {
      const p = m.getLatLng();
      try {
        mapRef.current.flyTo([p.lat, p.lng], 10, { duration: 0.7 });
        mapRef.current.once("moveend", () => {
          try {
            m.openPopup();
          } catch (e) {}
        });
      } catch (e) {
        mapRef.current.setView([p.lat, p.lng], 10);
        try {
          m.openPopup();
        } catch (err) {}
      }
    }
  }, [events, searchParams, leafletReady]);

  const circuits = useMemo(() => {
    const set = new Set();
    events.forEach((e) => e.circuit && set.add(e.circuit));
    return Array.from(set).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    let list = events;
    if (circuitFilter) {
      list = list.filter(
        (ev) =>
          (ev.circuit || "").toLowerCase() === circuitFilter.toLowerCase(),
      );
    }
    if (search) {
      const term = search.toLowerCase();
      list = list.filter((ev) => {
        const name = (ev.name || ev.id || "").toLowerCase();
        const circuit = (ev.circuit || "").toLowerCase();
        const loc = (getEventLocation(ev) || "").toLowerCase();
        return (
          name.includes(term) || circuit.includes(term) || loc.includes(term)
        );
      });
    }
    return list;
  }, [events, circuitFilter, search]);

  function handleCenter(ev) {
    if (!ev || !mapRef.current) return;
    const id = ev.id || ev._id || ev.key;
    const marker = markersById.current.get(String(id));
    if (marker && typeof marker.getLatLng === "function") {
      const p = marker.getLatLng();
      try {
        mapRef.current.flyTo([p.lat, p.lng], 10, { duration: 0.7 });
        mapRef.current.once("moveend", () => {
          try {
            marker.openPopup();
          } catch (e) {}
        });
      } catch (e) {
        mapRef.current.setView([p.lat, p.lng], 10);
        try {
          marker.openPopup();
        } catch (err) {}
      }
    }
  }

  return (
    <main className="max-w-7xl mx-auto my-6 px-4 grid gap-4">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold">Events Map</h1>
          <p className="text-sm text-gray-600">
            <Button asChild variant="link" className="h-auto p-0">
              <Link to="/">Back to list</Link>
            </Button>
          </p>
        </div>
      </header>

      {error && <div className="text-red-600">{error}</div>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <Card
          className="overflow-hidden"
          style={{
            height: "70vh",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#f5f5f5",
          }}
        >
          <div
            id="map"
            style={{
              width: "100%",
              flex: "1",
              position: "relative",
              zIndex: 1,
              backgroundColor: "#e8e8e8",
            }}
          >
            {loading ? (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1000,
                }}
              >
                Loading map…
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="font-semibold">
              Events ({filteredEvents.length})
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 pt-0">
            <input
              type="search"
              placeholder="Search by name, circuit, or location"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
            />
            <select
              value={circuitFilter}
              onChange={(e) => setCircuitFilter(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
            >
              <option value="">All circuits</option>
              {circuits.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="grid gap-2 max-h-[65vh] overflow-auto pr-1">
              {loading ? (
                <div className="text-gray-600">Loading events…</div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-gray-600">
                  No events match the filters.
                </div>
              ) : (
                filteredEvents.map((ev) => {
                  const id = ev.id;
                  const dateText = getEventDateText(ev);
                  const locText = getEventLocation(ev);
                  const recapDates = Array.isArray(ev.recaps)
                    ? ev.recaps.map((r) => r && r.date).filter(Boolean)
                    : [];
                  const dateRange = recapDates.length
                    ? formatDateRange(recapDates)
                    : dateText;

                  return (
                    <div
                      key={id}
                      className="border rounded-md p-2 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {ev.name}
                        </div>
                        <div className="text-xs text-gray-600 truncate">
                          {ev.circuit}
                        </div>
                        <div className="text-xs text-gray-600 truncate">
                          {dateRange}
                        </div>
                        <div className="text-xs text-gray-600 truncate">
                          {locText}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          asChild
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                        >
                          <Link to={`/event/${encodeURIComponent(id)}`}>
                            Details
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          onClick={() => handleCenter(ev)}
                          variant="outline"
                          size="sm"
                        >
                          Center
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
