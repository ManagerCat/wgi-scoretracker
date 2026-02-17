import { initializeApp, applicationDefault, cert, } from "firebase-admin/app";
import * as Credentials from "./wgiscoreapp-c0f8f08ebe54.json" with { type: "json" };
const ServiceAccount = Credentials.default;
import {
  getFirestore,
  Filter
} from "firebase-admin/firestore";
initializeApp({
  credential: cert(ServiceAccount),
});

const db = getFirestore();
const groupsDB = db.collection("groups");

async function addAlias(groupName, alias) {
  const groupSnapshot = await groupsDB.where(
    Filter.or(
      Filter.where("name", "==", groupName),
      Filter.where("aliases", "array-contains", groupName),
      Filter.where("name", "==", alias),
      Filter.where("aliases", "array-contains", alias)
    )
  ).get();

  if (groupSnapshot.empty) {
    console.log(`Group ${groupName} and Alias ${alias} not found.`);
    return;
  }
  var latestScores
  var date = null
  var aliases = new Set()
  var docRef


  const groupDocs = groupSnapshot
  groupDocs.docs.forEach(async (doc, index) => {
    const data = doc.data()
    if (data.date > date) {
        latestScores = data.scores
    }
    aliases.add(...data.aliases)
    console.log(index)
    if (index > 0) {
        console.log("Deleting Document")
        await doc.ref.delete()
    } else {
        docRef = doc.ref
    }
  })

  console.log({
        aliases: (aliases.length > 0 ? [...aliases, alias]: [alias]),
        scores: latestScores,
        name: groupName,
        date: date
      })
  
  await docRef.update({
    aliases: (aliases.length > 0 ? [...aliases, alias]: [alias]),
    scores: latestScores,
    name: groupName,
  });

  console.log(`Alias ${alias} added to group ${groupName}.`);
}

addAlias("Saratoga HS World", "Saratoga HS")