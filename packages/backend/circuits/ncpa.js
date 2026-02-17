import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import fs from "fs";
import processRecap from "../utils/recap-worker.js";
import recapPool from "../utils/recapPool.js";

/**
 * Scrape NCPA score pages and process recap pages.
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
  await page.goto("https://www.nc-pa.org/scores");
  const scoreBox = await page.evaluate(() => {
    return document.querySelector(
      "#dropdown-block-yui_3_17_2_1_1688327012030_32753-0 > div",
    ).outerHTML;
  });
  await browser.close();
  const $ = cheerio.load(scoreBox);
  const raw = $.extract({
    recap: [
      {
        selector: "p > a",
        value: "href",
      },
    ],
    name: [
      {
        selector: "p > a",
        value: "innerText",
      },
    ],
  });
  console.log("NCPA: Finished Scraping Event Data");
  console.log("NCPA: Processing Recaps...");
  const eventsPromises = [];
  raw.recap.forEach((element, index) => {
    if (raw.name[index].split("-")[2]) {
      return; // Skip if I&E
    }
    const name = raw.name[index].split("-")[1].trim();
    const recapUrl = raw.recap[index];
    eventsPromises.push(
      (async () => {
        let recaps;
        try {
          console.log("NCPA: Enqueueing recap for ", name);
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
          // date: new Date(dateStr),
          recaps: recaps,
          circuit: "NCPA",
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
  await page.goto("https://www.nc-pa.org/events");
  const schedules = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        "article.eventlist-event.eventlist-event--upcoming",
      ),
    ).map((el) => ({
      name: el.querySelector(".eventlist-title > a").innerText,
      date: new Date(
        el
          .querySelector(".eventlist-datetag-inner")
          .innerText.split("\n")
          .join(" ")
          .trim() + " 2026",
      ).toISOString(),
    }));
  });
  await browser.close();
  fs.readFile("./schedules.json", "utf8", (err, data) => {
    if (err) {
      console.error("Error reading schedule file:", err);
      return;
    }
    data = JSON.parse(data);
    data.ncpa = schedules;
    data = JSON.stringify(data);
    fs.writeFile("schedules.json", data, (err) => {
      if (err) {
        console.error("Error writing schedule to file:", err);
      } else {
        console.log("Schedule written to file successfully.");
      }
    });
  });

  return schedules;
}

export default { getScore, refreshSchedule };

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
