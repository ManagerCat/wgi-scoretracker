import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import * as Credentials from "./wgiscoreapp-c0f8f08ebe54.json" with { type: "json" };
const ServiceAccount = Credentials.default;
import { getFirestore } from "firebase-admin/firestore";
initializeApp({
  credential: cert(ServiceAccount),
});
const db = getFirestore();
import recapPool from "./utils/recapPool.js";
import eventUploader from "./utils/eventUploader.js";
async function main() {
  await eventUploader(db, "GIPA");
  await eventUploader(db, "FFCC");
  await eventUploader(db, "WGI");
  await eventUploader(db, "SCPA");
  await eventUploader(db, "NCPA");
}

main()
  .then(() => {
    console.log("Index: main finished");
  })
  .catch((err) => {
    console.error("Index: main error", err);
  })
  .finally(async () => {
    try {
      await recapPool.close();
      console.log("Index: recap pool closed");
    } catch (e) {
      console.error("Index: error closing recap pool", e);
    }
    // give logs a moment to flush then exit
    setTimeout(() => process.exit(0), 50);
  });
