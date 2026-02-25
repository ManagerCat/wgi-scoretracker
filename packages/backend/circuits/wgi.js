import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import writeSchedule from "../utils/writeSchedule.js";
import processRecap from "../utils/recap-worker.js";
import recapPool from "../utils/recapPool.js";

function parseDateRange(dateString) {
  // Parse formats like "apr 24-26 2025" or "apr 24 - 26 2025"
  const parts = dateString
    .toLowerCase()
    .match(/(\w+)\s+(\d+)\s*[-–]\s*(\d+)\s+(\d+)/);
  if (!parts) return [];

  const [, month, startDay, endDay, year] = parts;
  const startDate = new Date(`${month} ${startDay}, ${year}`);
  const endDateObj = new Date(`${month} ${endDay}, ${year}`);

  const dates = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDateObj) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

/**
 * Scrape WGI percussion scores and process recap pages.
 * Returns an array of processed events ready for insertion into the DB.
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
  await page.goto("https://wgi.org/scores/percussion-scores/");
  await page.waitForSelector("div#event-list-table > table");
  const season = await page.evaluate(() => {
    return document
      .querySelector(
        "body > div.elementor.elementor-432902.elementor-location-single.post-437889.page.type-page.status-publish.has-post-thumbnail.hentry > section.elementor-section.elementor-inner-section.elementor-element.elementor-element-4ca1971c.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default > div > div > div > div.elementor-element.elementor-element-3854bd3a.elementor-hidden-mobile.elementor-widget.elementor-widget-heading > div > h1",
      )
      .innerText.split(" ")[0];
  });
  const dayTables = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll("div#event-list-table > table"),
    ).map((tr) => {
      return tr.outerHTML;
    });
  });
  let days = [];
  dayTables.forEach((score) => {
    const $ = cheerio.load(score);
    days.push(
      $.extract({
        events: [
          {
            selector: "tr:not(:first)",
            value: {
              name: {
                selector: "td.event-name",
                value: "innerText",
              },
              recap: {
                selector: "td.event-recap > a",
                value: "href",
              },
            },
          },
        ],
      }),
    );
  });
  await browser.close();
  console.log("WGI: Finished Scraping Event Data");
  console.log("WGI: Processing Recaps...");

  const eventsPromises = [];
  days.forEach((day) => {
    day.events.forEach((event) => {
      eventsPromises.push(
        (async () => {
          // run recap in a worker thread for parallelism
          let recaps;
          try {
            console.log("WGI: Enqueueing recap for ", event.name);
            recaps = await recapPool.enqueue(event.recap);
          } catch (err) {
            console.error("WGI: recap pool failed, falling back:", err);
            recaps = await processRecap(event.recap);
          }

          recaps.forEach((recap) => {
            recap.groups.forEach((group) => {
              group.captions = group.captions.map((c) => parseFloat(c));
              group.subtotal = parseFloat(group.subtotal);
              group.total = parseFloat(group.total);
            });
          });

          return {
            name: event.name,
            recaps: recaps,
            circuit: "WGI",
            recapUrl: event.recap,
          };
        })(),
      );
    });
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
  await page.goto("https://wgi.org/percussion/p-calendar/");
  const rawEvents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("div.events-list-row")).map(
      (el) => {
        return {
          name: el.querySelector(".events-list-location").textContent,
          date:
            el.querySelector(".events-list-date").textContent.trim() + " 2025",
        };
      },
    );
  });

  const events = rawEvents.map((event) => ({
    name: event.name,
    date: parseDateRange(event.date),
  }));

  events.forEach((event, i) => {
    events[i].date = event.date.map((date) => {
      return date.toISOString();
    });
  });
  console.log(events);
  await writeSchedule("wgi", events);

  // for (let i = 0; i < events.length; i++) {
  //   await page.goto(events[i]);
  //   schedule.push({
  //     name: await page.evaluate(() => {
  //       return document
  //         .querySelector("h1.event-location-type-date")
  //         .innerText.split("\n")[0]
  //         .trim();
  //     }),
  //     date: await page.evaluate(() => {
  //       return Date.parse(
  //         document
  //           .querySelector("h1.event-location-type-date")
  //           .innerText.split("\n")[1]
  //       );
  //     }),
  //   });
  // }
  // console.log(schedule);
  // browser.close();
}

export default getScore;
// refreshSchedule();
// getScore().then((data) => console.log(data));
