import fs from "fs";
import recapPool from "./utils//recapPool.js";
import { getCompetitions } from "./utils/bridge.js";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
// import * as Credentials from "./wgiscoreapp-c0f8f08ebe54.json" with { type: "json" };
// const ServiceAccount = Credentials.default;
initializeApp({
  //   credential: cert(ServiceAccount),
  credential: applicationDefault(),
});
import { getFirestore } from "firebase-admin/firestore";
const db = getFirestore();
import eventUploader from "./utils/eventUploader.js";

var d = [];
fs.readFile("./circuits.json", async (err, data) => {
  if (err) {
    console.error("Error reading circuits.json:", err);
    return;
  }

  const circuits = JSON.parse(data);
  await circuits.forEach(async (circuit) => {
    for (const [key, value] of Object.entries(circuit)) {
      var eventName;
      getCompetitions(value).then(async (competitions) => {
        competitions.forEach(async (item) => {
          const recaps = await recapPool.enqueue(
            `https://recaps.competitionsuite.com/${item}.htm`
          );
          recaps.forEach((recap) => {
            recap.groups.forEach((group) => {
              group.captions = group.captions.map((c) => parseFloat(c));
              group.subtotal = parseFloat(group.subtotal);
              group.total = parseFloat(group.total);
            });
            eventName = recap.name;
          });

          console.log({
            name: eventName,
            recaps: recaps,
            circuit: key,
            recapUrl: `https://recaps.competitionsuite.com/${item}.htm`,
          });
          eventUploader(db, {
            name: eventName,
            recaps: recaps,
            circuit: key,
            recapUrl: `https://recaps.competitionsuite.com/${item}.htm`,
          });
        });
      });
    }
  });
});
