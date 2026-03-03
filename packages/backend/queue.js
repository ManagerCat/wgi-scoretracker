import fs from "fs";
import recapPool from "./utils//recapPool.js";
import { initializeApp } from "firebase-admin/app";
var eventCache = JSON.parse(fs.readFileSync("./eventCache.json", "utf-8"));
initializeApp();
import { getFirestore } from "firebase-admin/firestore";
const db = getFirestore();
import eventUploader from "./utils/eventUploader.js";

fs.readFile("./circuits.json", async (err, data) => {
  if (err) {
    console.error("Error reading circuits.json:", err);
    return;
  }

  const circuits = JSON.parse(data);
  const tasks = [];
  for (const circuit of circuits) {
    for (const [key, value] of Object.entries(circuit)) {
      const competitions = await recapPool.enqueueBridge(value);
      for (const item of competitions) {
        if (eventCache.includes(item)) {
          console.log(`Skipping event ${item} (already in cache)`);
          continue;
        }
        tasks.push(
          (async () => {
            const recaps = await recapPool.enqueue(
              `https://recaps.competitionsuite.com/${item}.htm`,
            );
            recaps.forEach((recap) => {
              recap.groups.forEach((group) => {
                group.captions = group.captions.map((c) => parseFloat(c));
                group.subtotal = parseFloat(group.subtotal);
                group.total = parseFloat(group.total);
              });
            });
            const eventName = recaps.length ? recaps[0].name : undefined;

            // console.log({
            //   name: eventName,
            //   recaps,
            //   circuit: key,
            //   recapUrl: `https://recaps.competitionsuite.com/${item}.htm`,
            // });
            console.log(!eventName || eventName.includes("test"));
            if (!eventName || eventName.toLowerCase().includes("test")) {
              return;
            }
            await eventUploader(db, {
              name: eventName,
              recaps,
              circuit: key,
              recapUrl: `https://recaps.competitionsuite.com/${item}.htm`,
            });

            fs.writeFile(
              "./eventCache.json",
              JSON.stringify([...eventCache, item]),
              (err) => {
                eventCache = [...eventCache, item]
                if (err) {
                  console.error("Error writing to eventCache.json:", err);
                } else {
                  console.log(`Added ${item} to eventCache.json`);
                }
              },
            );
          })(),
        );
      }
    }
  }

  try {
    await Promise.all(tasks);
  } finally {
    if (typeof recapPool.close === "function") {
      await recapPool.close();
    }
  }
});
