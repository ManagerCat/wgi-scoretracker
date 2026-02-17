import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import fs from "fs";
import writeSchedule from "../utils/writeSchedule.js";
import processRecap from "../utils/recap-worker.js";
import recapPool from "../utils/recapPool.js";

/**
 * Scrape FFCC event list and process recap pages.
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
  await page.goto("https://ffcc.org/events/scores-ffcc/");
  const indoorItems = await page.evaluate(() => {
    //get list for most first ie most recent indoor season
    return [...document.querySelectorAll(".accordian")].filter((r) =>
      r.innerText.includes("Indoor"),
    )[0].innerHTML;
  });

  await browser.close();
  const $ = cheerio.load(indoorItems);

  // Manual extraction: each paragraph contains a date and an <a> with the recap
  const recap = [];
  const name = [];
  const date = [];

  $("p").each((i, el) => {
    const $el = $(el);
    const $a = $el.find('a[target="_blank"]');
    if ($a.length === 0) return; // skip paragraphs without recap links
    const href = $a.attr("href") || "";
    const title = $a.text().trim();
    // paragraph text contains the date plus the anchor text; remove anchor text to get date
    const fullText = $el.text().trim();
    const dateText = fullText.replace(title, "").trim();
    recap.push(href);
    name.push(title);
    date.push(dateText);
  });

  const raw = { recap, name };
  console.log("FFCC: Finished Scraping Event Data");
  console.log("FFCC: Processing Recaps...");
  const eventsPromises = [];
  raw.name.forEach((item, index) => {
    const name = raw.name[index].trim();
    const recapUrl = raw.recap[index];
    eventsPromises.push(
      (async () => {
        // try worker first for parallelism
        let recaps;
        try {
          console.log("FFCC: Enqueueing recap ", recapUrl);
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
        // if (!recaps || recaps.length === 0) return null;
        return {
          name: name.split(" ").slice(1).join(" "), // remove date from name
          recaps: recaps,
          circuit: "FFCC",
          recapUrl: recapUrl,
        };
      })(),
    );
  });

  const events = await Promise.all(eventsPromises);

  return events;
}

async function refreshSchedule() {
  // todo: implement
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
    .locator("body > div.side-nav.slide-it > div > a:nth-child(13)")
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
// getScore().then((data) => console.log(data));
