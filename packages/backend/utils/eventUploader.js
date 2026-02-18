import { getScore as getSCPAScore } from "../circuits/scpa.js";
import { getScore as getNCPAScore } from "../circuits/ncpa.js";
import { getScore as getWGIScore } from "../circuits/wgi.js";
import { getScore as getFFCCScore } from "../circuits/ffcc.js";
import { getScore as getGIPAScore } from "../circuits/gipa.js";
import { Filter } from "firebase-admin/firestore";
import fs from "fs";
import geocodeLocation from "./geocoder.js";

/**
 * Geocode event location and add coordinates to event
 * @param {Object} event - Event object with recaps
 * @returns {Promise<void>}
 */
async function geocodeEvent(event) {
  // Try to get location from the first recap
  if (!event.recaps || event.recaps.length === 0) {
    return;
  }

  const location = event.recaps[0]?.location;
  if (!location) {
    return;
  }

  // Skip if already geocoded
  if (event.coordinates && event.coordinates.lat && event.coordinates.lng) {
    return;
  }

  try {
    const geocoded = await geocodeLocation(location);
    if (geocoded) {
      event.coordinates = {
        lat: geocoded.lat,
        lng: geocoded.lng,
      };
      event.formatted_address = geocoded.formatted_address;
      console.log(
        `Event Uploader: Geocoded event "${event.name}" -> ${geocoded.lat}, ${geocoded.lng}`,
      );
    }
  } catch (error) {
    console.error(
      `Event Uploader: Failed to geocode event "${event.name}":`,
      error.message,
    );
  }
}

/**
 *
 * @param {Object} db The Firestore database object
 * @param {string} circuit The circuit to process (e.g., "WGI", "SCPA", "NCPA")
 *
 */

export default async function eventUploader(db, circuit) {
  const eventsDB = db.collection("events");
  const groupsDB = db.collection("groups");
  var events;

  switch (circuit) {
    case "WGI":
      events = await getWGIScore();
      break;
    case "SCPA":
      events = await getSCPAScore();
      break;
    case "NCPA":
      events = await getNCPAScore();
      break;
    case "FFCC":
      events = await getFFCCScore();
      break;
    case "GIPA":
      events = await getGIPAScore();
      break;
  }

  for (const event of events) {
    if (event) {
      let eventId;
      let dbEvent = await eventsDB
        .where(Filter.where("name", "==", event.name))
        .get();
      if (dbEvent.empty) {
        console.log(`Index: New Event Found! Adding to DB: ${event.name}`);
        // delete any event recap where division does not start with "Percussion"
        event.recaps = event.recaps.filter((recap) =>
          recap.division.startsWith("Percussion"),
        );
        if (event.recaps.length === 0) continue; // empty event...

        // Geocode the event location
        await geocodeEvent(event);

        // Sanitize recap and top-level date fields to ensure Firestore receives
        // valid JS Date objects (invalid dates will be removed). This avoids
        // errors like "Value for argument 'seconds' is not a valid integer" when
        // the Firestore SDK attempts to serialize invalid dates.
        try {
          function safeDateOrNull(v) {
            if (!v && v !== 0) return null;
            if (
              typeof v === "object" &&
              v !== null &&
              typeof v.toDate === "function"
            ) {
              try {
                const d = v.toDate();
                return isNaN(d.getTime()) ? null : d;
              } catch (e) {
                return null;
              }
            }
            if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
            if (typeof v === "number") {
              const d = new Date(v);
              return isNaN(d.getTime()) ? null : d;
            }
            try {
              const d = new Date(v);
              return isNaN(d.getTime()) ? null : d;
            } catch (e) {
              return null;
            }
          }

          if (Array.isArray(event.recaps)) {
            for (const r of event.recaps) {
              if (r && Object.prototype.hasOwnProperty.call(r, "date")) {
                const sd = safeDateOrNull(r.date);
                if (sd) r.date = sd;
                else delete r.date;
              }
            }
          }
          if (Object.prototype.hasOwnProperty.call(event, "date")) {
            const sd = safeDateOrNull(event.date);
            if (sd) event.date = sd;
            else delete event.date;
          }
        } catch (e) {
          console.error(
            `Event Uploader: Error sanitizing date fields for event "${event.name}":`,
            e,
          );
        }

        // Process recaps and add group IDs BEFORE adding the event
        eventId = "temp"; // temporary ID for new event
        for (const recap of event.recaps) {
          if (!recap.division.startsWith("Percussion")) {
            continue; // skip winds recaps
          }

          for (const recapGroup of recap.groups) {
            var scores = Object.fromEntries(
              recap.captions.map((key, i) => [key, recapGroup.captions[i]]),
            );

            scores["Total"] = recapGroup.total;
            scores["Subtotal"] = recapGroup.subtotal;
            const lcName = (recapGroup.name || "").toLowerCase();
            let group = await groupsDB
              .where(
                Filter.or(
                  Filter.where("name", "==", recapGroup.name),
                  Filter.where("aliases", "array-contains", recapGroup.name),
                  Filter.where("name_lower", "==", lcName),
                  Filter.where("aliases_lower", "array-contains", lcName),
                ),
              )
              .get();

            if (group.empty) {
              console.log(
                "Event Uploader: New Group Found! Adding to DB:",
                recapGroup.name,
              );
              const safeDate =
                recap &&
                recap.date instanceof Date &&
                !isNaN(recap.date.getTime())
                  ? recap.date
                  : null;

              const groupDoc = {
                name: recapGroup.name,
                aliases: [],
                name_lower: recapGroup.name.toLowerCase(),
                aliases_lower: [],
                scores: [], // Will be updated after event is created
                division: recap.division,
                circuit: event.circuit,
              };
              if (safeDate) groupDoc.date = safeDate;

              await groupsDB
                .add(groupDoc)
                .then((docRef) => {
                  recapGroup.groupId = docRef.id;
                  console.log(
                    `Event Uploader: Group ${recapGroup.name} written with ID: `,
                    docRef.id,
                  );
                })
                .catch((error) => {
                  console.error(
                    `Event Uploader: Error writing group ${recapGroup.name} to Firestore:`,
                    error,
                  );
                });
            } else {
              const doc = group.docs[0];
              recapGroup.groupId = doc.id;
            }
          }
        }

        await eventsDB
          .add(event)
          .then((docRef) => {
            eventId = docRef.id;
            console.log(
              `Index: Event ${event.name} written with ID: `,
              docRef.id,
            );
            // fs.writeFileSync("event_debug.json", JSON.stringify(event));
          })
          .catch((error) => {
            console.error(
              `Index: Error writing event ${event.name} to Firestore:`,
              error,
            );
          });

        // Now update group scores with the actual event ID
        for (const recap of event.recaps) {
          if (!recap.division.startsWith("Percussion")) {
            continue;
          }

          for (const recapGroup of recap.groups) {
            if (!recapGroup.groupId) continue;

            var scores = Object.fromEntries(
              recap.captions.map((key, i) => [key, recapGroup.captions[i]]),
            );
            scores["Total"] = recapGroup.total;
            scores["Subtotal"] = recapGroup.subtotal;

            const safeDate =
              recap &&
              recap.date instanceof Date &&
              !isNaN(recap.date.getTime())
                ? recap.date
                : null;

            const groupRef = groupsDB.doc(recapGroup.groupId);
            const groupSnap = await groupRef.get();
            if (groupSnap.exists) {
              const data = groupSnap.data();
              const existingScores = data.scores.find(
                (s) => s.eventId === eventId,
              );
              if (!existingScores) {
                await groupRef.update({
                  scores: [...data.scores, { eventId, date: safeDate, scores }],
                });
              }
            }
          }
        }
      } else {
        eventId = dbEvent.docs[0].id;
        // Update existing event: geocode if not already done
        const existingData = dbEvent.docs[0].data();
        if (!existingData.coordinates || !existingData.coordinates.lat) {
          await geocodeEvent(event);
        }

        // Update existing event: sanitize date fields before writing
        try {
          function safeDateOrNull(v) {
            if (!v && v !== 0) return null;
            if (
              typeof v === "object" &&
              v !== null &&
              typeof v.toDate === "function"
            ) {
              try {
                const d = v.toDate();
                return isNaN(d.getTime()) ? null : d;
              } catch (e) {
                return null;
              }
            }
            if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
            if (typeof v === "number") {
              const d = new Date(v);
              return isNaN(d.getTime()) ? null : d;
            }
            try {
              const d = new Date(v);
              return isNaN(d.getTime()) ? null : d;
            } catch (e) {
              return null;
            }
          }

          if (Array.isArray(event.recaps)) {
            for (const r of event.recaps) {
              if (r && Object.prototype.hasOwnProperty.call(r, "date")) {
                const sd = safeDateOrNull(r.date);
                if (sd) r.date = sd;
                else delete r.date;
              }
            }
          }
          if (Object.prototype.hasOwnProperty.call(event, "date")) {
            const sd = safeDateOrNull(event.date);
            if (sd) event.date = sd;
            else delete event.date;
          }
        } catch (e) {
          console.error(
            `Event Uploader: Error sanitizing date fields for event "${event.name}":`,
            e,
          );
          // non-fatal, continue with original event
        }

        // Process recaps and add group IDs BEFORE updating the event
        for (const recap of event.recaps) {
          if (!recap.division.startsWith("Percussion")) {
            continue; // skip winds recaps
          }

          for (const recapGroup of recap.groups) {
            var scores = Object.fromEntries(
              recap.captions.map((key, i) => [key, recapGroup.captions[i]]),
            );

            scores["Total"] = recapGroup.total;
            scores["Subtotal"] = recapGroup.subtotal;
            const lcName = (recapGroup.name || "").toLowerCase();
            let group = await groupsDB
              .where(
                Filter.and(
                  Filter.or(
                    Filter.where("name", "==", recapGroup.name),
                    Filter.where("aliases", "array-contains", recapGroup.name),
                    Filter.where("name_lower", "==", lcName),
                    Filter.where("aliases_lower", "array-contains", lcName),
                  ),
                  Filter.where("division", "==", recap.division),
                ),
              )
              .get();
            if (group.empty) {
              console.log(
                "Event Uploader: New Group Found! Adding to DB:",
                recapGroup.name,
              );
              const safeDate =
                recap &&
                recap.date instanceof Date &&
                !isNaN(recap.date.getTime())
                  ? recap.date
                  : null;

              const groupDoc = {
                name: recapGroup.name,
                aliases: [],
                name_lower: recapGroup.name.toLowerCase(),
                aliases_lower: [],
                scores: [{ eventId, date: safeDate, scores }],
                division: recap.division,
                circuit: event.circuit,
              };
              if (safeDate) groupDoc.date = safeDate;

              await groupsDB
                .add(groupDoc)
                .then((docRef) => {
                  recapGroup.groupId = docRef.id;
                  console.log(
                    `Event Uploader: Group ${recapGroup.name} written with ID: `,
                    docRef.id,
                  );
                })
                .catch((error) => {
                  console.error(
                    `Event Uploader: Error writing group ${recapGroup.name} to Firestore:`,
                    error,
                  );
                });
            } else {
              const doc = group.docs[0];
              const data = doc.data();
              recapGroup.groupId = doc.id;

              const existingScores = data.scores.find(
                (s) => s.eventId === eventId,
              );
              if (existingScores) {
                console.log(
                  `Event Uploader: Scores for group ${recapGroup.name} with event ${event.name} already exist.`,
                );
              } else {
                const latestRecapDate = Math.max(
                  ...event.recaps.map((recap) =>
                    recap.date ? recap.date.getTime() : 0,
                  ),
                );

                let update = {
                  scores: [
                    ...data.scores,
                    { eventId, date: recap.date, scores },
                  ],
                };
                if (latestRecapDate < recap.date) {
                  update = {
                    ...update,
                    division: recap.division,
                  };
                }
                await doc.ref.update(update).then(() => {
                  console.log(
                    `Event Uploader: Updated scores for group ${recapGroup.name} with event ${event.name}`,
                  );
                });
              }
            }
          }
        }

        // Update event with group IDs in recaps
        await dbEvent.docs[0].ref.update({ recaps: event.recaps });
      }
    } else {
      console.log("event already exists");
    }
  }
}
