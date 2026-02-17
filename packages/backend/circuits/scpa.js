import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import fs from "fs";
import writeSchedule from "../utils/writeSchedule.js";
import processRecap from "../utils/recap-worker.js";
import recapPool from "../utils/recapPool.js";

/**
 * Scrape SCPA event list and process recap pages.
 *
 * @returns {Promise<CircuitEvent[]>} Promise resolving to an array of CircuitEvent
 */
export async function getScore() {
  const browser = await puppeteer.launch({
    // headless: false,
    // defaultViewport: null,
    // args: ["--start-maximized"],
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
  );
  await page.goto("https://scpa.live");
  await page.locator("body > button.navbar-toggle").click();
  await page.setViewport({ width: 1200, height: 800 }); // ensure scores are visible

  await page
    .locator("body > div.side-nav.slide-it > div > a:nth-child(14)")
    .click();
  const scoresBox = await page.evaluate(() => {
    return document.querySelectorAll(
      "div.scores_box:not(.the_header) > div > ul",
    )[0].outerHTML; //should be [0] for 2026 but no scores uploaded yet
  });
  await browser.close();
  fs.writeFileSync("scpa-scores.html", scoresBox); // for debugging
  const $ = cheerio.load(scoresBox);

  const raw = $.extract({
    recap: [
      {
        selector: "li > a",
        value: "href",
      },
    ],
    name: [
      {
        selector: "li:not(.active)",
        value: "innerText",
      },
    ],
  });
  await browser.close();
  console.log("SCPA: Finished Scraping Event Data");
  console.log("SCPA: Processing Recaps...");
  const eventsPromises = [];
  console.log(raw);
  raw.name.forEach((item, index) => {
    const name = raw.name[index].trim().split("\n")[1].trim();
    const recapUrl = raw.recap[index];
    eventsPromises.push(
      (async () => {
        // try worker first for parallelism
        let recaps;
        try {
          console.log("SCPA: Enqueueing recap ", recapUrl);
          recaps = await recapPool.enqueue(recapUrl);
        } catch (err) {
          console.error("recap pool failed, falling back:", err);
          recaps = await processRecap(recapUrl);
        }
        recaps.forEach((recap) => {
          recap.groups.forEach((group) => {
            group.captions = group.captions.map((c) => parseFloat(c));
            group.subtotal = parseFloat(group.subtotal);
            group.total = parseFloat(group.total);
          });
        });
        return {
          name: name,
          recaps: recaps,
          circuit: "SCPA",
          recapUrl: recapUrl,
        };
      })(),
    );
  });

  const events = await Promise.all(eventsPromises);

  return events;
}

async function refreshSchedule() {
  const browser = await puppeteer.launch({
    // headless: false,
    // defaultViewport: null,
    // args: ["--start-maximized"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
  );
  await page.goto("https://scpa.live");
  await page.locator("body > button.navbar-toggle").click();
  await page
    .locator("body > div.side-nav.slide-it > div > a:nth-child(14)")
    .click();
  const schedules = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        "div.schedule_box:not(.the_header) > div > div.current > div.row",
      ),
    ).map((el) => ({
      name: el
        .querySelector("div.col-xs-9 > p")
        .innerText.split("\n")[0]
        .trim(),
      date: Date.parse(
        el.querySelector("div.col-xs-3").innerText.split(" ")[0],
      ),
    }));
  });

  console.log(schedules);
  writeSchedule("scpa", schedules);
  // fs.readFile("./schedules.json", "utf8", (err, data) => {
  //   if (err) {
  //     console.error("Error reading schedule file:", err);
  //     return;
  //   }
  //   data = JSON.parse(data);
  //   data.scpa = schedules;
  //   data = JSON.stringify(data);
  //   fs.writeFile("schedules.json", data, (err) => {
  //     if (err) {
  //       console.error("Error writing schedule to file:", err);
  //     } else {
  //       console.log("Schedule written to file successfully.");
  //     }
  //   });
  // });
  browser.close();
}

export default { getScore, getSchedule: refreshSchedule };
// // refreshSchedule();

// getScore()
//   .then((s) => {
//     fs.writeFileSync("debug.json", JSON.stringify(s, null, 2));
//   })
//   .catch((e) => {
//     console.error(e);
//   })
//   .finally(async () => {
//     // close recap worker pool (if running) so the process can exit cleanly
//     try {
//       await recapPool.close();
//     } catch (e) {}
//     // ensure exit
//     process.exit(0);
//   });
