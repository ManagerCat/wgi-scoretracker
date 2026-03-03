import { parentPort, isMainThread } from "worker_threads";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import fs from "fs"; // for debugging purposes

// Core parser that accepts an array of section HTML strings and returns parsed data

/**
 * Parse recap sections from HTML strings.
 * @param {string[]} sections - Array of HTML strings representing recap sections
 * @returns {Object[]} Parsed recap data
 */

function parseSections(sections) {
  const data = [];

  sections.forEach((section) => {
    const $ = cheerio.load(section);
    const eventName = $("div:nth-child(3) > table > tbody > tr > td:nth-child(2) > div:nth-child(1)").text();
    const date = new Date(
      $(
        "div:nth-child(3) > table > tbody > tr > td:nth-child(2) > div:nth-child(3)"
      ).text()
    );
    const location = $(
      "div:nth-child(3) > table > tbody > tr > td:nth-child(2) > div:nth-child(2)"
    ).text();

    const $scoresTable = cheerio.load($("div").html());
    // fs.writeFileSync("debug.html", $scoresTable.html()); // for debugging
    const division = $scoresTable(
      "tbody > tr[class='header-division-name'] > td"
    ).text();
    const rows = $scoresTable(
      "tbody > tr:not(.header-division-name) > td > table:first > tbody"
    );

    const captionRow = rows.children().eq(0).remove();
    captionRow.children("td").filter(":first").remove(); // remove empty cell
    captionRow.children("td").filter(":first").remove(); // remove empty cell
    var captions = captionRow.extract({
      captions: [{ selector: "td", value: "innerText" }],
    });
    captions = captions.captions;
    captions = captions.slice(0, captions.length - 3); // last 3 cells are totals, penalties, and grand total
    rows.children().eq(0).remove(); // remove judges row
    rows.children().eq(0).remove(); // remove subcaption row
    const results = rows.extract({
      results: [
        {
          selector: "tr:has(td.topBorder)",
          value: {
            name: {
              selector: "td:first",
              value: "innerText",
            },
            captions: [
              {
                selector:
                  "td.subcaptionTotal > table > tbody > tr:has(td.score) > td",
                value: "innerText",
              },
            ],
            subtotal: {
              selector:
                "td:nth-last-of-type(3) > table > tbody > tr:has(td.score) > td",
              value: "innerText",
            },
            total: {
              selector:
                "td:nth-last-of-type(1) > table > tbody > tr:has(td.score) > td",
              value: "innerText",
            },
          },
        },
      ],
    });
    //remove any groups wihout scores (e.g. DQs that are listed but not scored)
    results.results = results.results.filter((r) => r.total > 0);
    // );
    // console.log(data)
    data.push({
      name: eventName,
      division: division,
      captions: captions,
      groups: results.results,
      date: date,
      location: location,
      // recapLink: recapUrl,
    });
  });
  return data;
}

// Default export: original behavior (launch browser per-call) in case workers fail
/**
 * Fetch and parse a recap page (one-off mode).
 * @param {string} recap - URL of the recap page to fetch
 * @returns {Promise<RawRecap[]>} Array of parsed recaps (raw string scores)
 */
export async function processRecap(recap) {
  const browser = await puppeteer.launch({
    // headless: false,
    // defaultViewport: null,
  });
  const page = await browser.newPage();
  await page.goto(recap);
  const sections = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll("div[style='margin-top: 30px;']")
    ).map((section) => section.outerHTML);
  });
  const data = parseSections(sections);
  await browser.close();
  return data;
}

export default processRecap;

// ── Bridge helper (runs inside the worker thread) ──────────────────────
const bridgeUrl =
  "https://bridge.competitionsuite.com/api/orgscores/GetCompetitionsBySeason/jsonp?season=";

async function fetchCompetitions(season) {
  const response = await fetch(bridgeUrl + season, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const data = await response.json();
  return data.competitions.map((c) => c.competitionGuid);
}

// Worker-mode: keep a persistent browser and reuse pages per job
if (!isMainThread && parentPort) {
  let workerBrowser = null;

  async function ensureBrowser() {
    if (!workerBrowser) {
      workerBrowser = await puppeteer.launch({
        // headless: true,
        // args: ['--no-sandbox']
      });
    }
  }

  parentPort.on("message", async (job) => {
    // support a shutdown command for graceful exit
    if (job && job.cmd === "shutdown") {
      console.log(`Worker ${process.pid}: received shutdown`);
      try {
        if (workerBrowser) {
          try {
            await workerBrowser.close();
          } catch (e) {
            console.error(`Worker ${process.pid}: error closing browser`, e);
          }
        }
      } finally {
        // exit cleanly
        process.exit(0);
      }
      return;
    }

    const { id, type } = job || {};

    // ── Bridge job: fetch competition GUIDs ──────────────────────────
    if (type === "bridge") {
      try {
        const competitions = await fetchCompetitions(job.season);
        parentPort.postMessage({ id, competitions });
      } catch (err) {
        parentPort.postMessage({
          id,
          error: err && err.message ? err.message : String(err),
        });
      }
      return;
    }

    // ── Recap job (default): scrape a recap page ─────────────────────
    const { url } = job || {};
    try {
      await ensureBrowser();
      const page = await workerBrowser.newPage();
      try {
        await page.goto(url);
        const sections = await page.evaluate(() => {
          return Array.from(
            document.querySelectorAll("div[style='margin-top: 30px;']")
          ).map((section) => section.outerHTML);
        });
        const recaps = parseSections(sections);
        parentPort.postMessage({ id, recaps });
      } finally {
        try {
          await page.close();
        } catch (e) {}
      }
    } catch (err) {
      parentPort.postMessage({
        id,
        error: err && err.message ? err.message : String(err),
      });
    }
  });

  // close browser on worker exit
  process.on("exit", () => {
    if (workerBrowser) {
      try {
        workerBrowser.close();
      } catch (e) {}
    }
  });
}
