import puppeteer from "puppeteer";
import writeSchedule from "../utils/writeSchedule.js";
import processRecap from "../utils/recap-worker.js";
import recapPool from "../utils/recapPool.js";

/**
 * Scrape GIPA event list and process recap pages.
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
  // Navigate to the live site and try to open the Scores view.
  await page.goto("https://www.gipacircuit.com/", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await page.setViewport({ width: 1280, height: 900 });

  // Try to click the 'SCORES' link using an XPath match (case-insensitive).
  try {
    // Dispatch a click from within the page to ensure JS-driven handlers run.
    await page.evaluate(() => {
      const a = document.evaluate(
        "//a[div/div/p[normalize-space()='SCORES']]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      if (a) a.click();
    });
    // allow time for the scores view to render
    await new Promise((r) => setTimeout(r, 2000));
  } catch (e) {
    // non-fatal — proceed to extraction and retry logic below
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Wait until at least one recap-like anchor is present (Prelims/Finals/Scores)
  try {
    await page.waitForFunction(
      () => {
        const anchors = Array.from(document.querySelectorAll("a"));
        return anchors.some((a) =>
          /^(Prelims|Finals|Scores)$/i.test((a.innerText || "").trim()),
        );
      },
      { timeout: 15000 },
    );
  } catch (e) {
    // timed out waiting for recap anchors; we'll still try extraction below
  }

  // Extract only visible links with labels like Prelims / Finals / Scores
  const rawLinks = await page.evaluate(() => {
    function looksLikeHeaderText(s) {
      if (!s) return false;
      s = s.toString().trim();
      // Year headings like "2025" should be ignored as titles
      if (/^\d{4}$/.test(s)) return false;
      // Event headers often contain a month name and a dash: "March 29 - Championships"
      if (
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
          s,
        ) &&
        / - /.test(s)
      )
        return true;
      // Also accept common short month forms
      if (
        /^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s*-/.test(
          s,
        )
      )
        return true;
      return false;
    }

    // Find anchors that match the visible labels we care about
    const anchors = Array.from(document.querySelectorAll("a"))
      .filter((a) => {
        const t = (a.innerText || "").trim();
        return /^(Prelims|Finals|Scores)$/i.test(t) && a.offsetParent !== null; // visible
      })
      .map((a) => ({
        href: a.href,
        label: (a.innerText || "").trim(),
        node: a,
      }));

    const results = [];
    anchors.forEach(({ href, label, node }) => {
      // Find an event header near this anchor by walking previous siblings upwards
      let el = node;
      let title = null;

      // search previous siblings in the ancestor chain
      function findHeaderFrom(node) {
        let cur = node.previousElementSibling;
        while (cur) {
          const txt = (cur.innerText || "").trim();
          if (looksLikeHeaderText(txt)) return txt;
          // if cur contains a header inside, try that
          const header =
            cur.querySelector && cur.querySelector("h1,h2,h3,h4,div,span");
          if (header) {
            const ht = (header.innerText || "").trim();
            if (looksLikeHeaderText(ht)) return ht;
          }
          cur = cur.previousElementSibling;
        }
        return null;
      }

      // Try several heuristic climbs: siblings, parent siblings, ancestor previous siblings
      title = findHeaderFrom(el);
      if (!title) {
        let ancestor = el.parentElement;
        while (ancestor && ancestor !== document.body && !title) {
          title = findHeaderFrom(ancestor);
          ancestor = ancestor.parentElement;
        }
      }

      // As a last resort, look for the nearest preceding element with a month name
      if (!title) {
        const all = Array.from(document.querySelectorAll("*"));
        const idx = all.indexOf(node);
        for (let i = idx - 1; i >= 0 && i > idx - 40; i--) {
          const txt = (all[i].innerText || "").trim();
          if (looksLikeHeaderText(txt)) {
            title = txt;
            break;
          }
        }
      }

      if (!title) return; // couldn't find a neighboring event header

      // Attempt to find a nearby year heading (e.g., "2025") preceding this anchor
      function findYearFrom(node) {
        let cur = node.previousElementSibling;
        while (cur) {
          const t = (cur.innerText || "").trim();
          if (/^\d{4}$/.test(t)) return parseInt(t, 10);
          // also check descendants
          const desc =
            cur.querySelector &&
            Array.from(cur.querySelectorAll("*")).find((d) =>
              /^\d{4}$/.test((d.innerText || "").trim()),
            );
          if (desc) return parseInt((desc.innerText || "").trim(), 10);
          cur = cur.previousElementSibling;
        }
        // fallback: scan a bit earlier in the document
        const all = Array.from(document.querySelectorAll("*"));
        const idx = all.indexOf(node);
        for (let i = idx - 1; i >= 0 && i > idx - 80; i--) {
          const txt = (all[i].innerText || "").trim();
          if (/^\d{4}$/.test(txt)) return parseInt(txt, 10);
        }
        return null;
      }

      // normalize title: take part after the dash if present
      const dashIndex = title.indexOf(" - ");
      const eventName =
        dashIndex >= 0 ? title.slice(dashIndex + 3).trim() : title.trim();

      const year = findYearFrom(node) || null;
      const key = `${eventName} - ${label}`;
      results.push({ key, eventName, label, href, year });
    });

    // If we found any years attached, determine the most recent year and
    // filter to only include events from that year. If no years were found,
    // return all results.
    const years = results.map((r) => r.year).filter((y) => y);
    if (years.length > 0) {
      const maxYear = Math.max(...years);
      return results.filter((r) => r.year === maxYear);
    }
    return results;
  });

  // If the initial in-page extraction returned nothing, retry against the
  // live site a few times (reload + extra wait) rather than using any local
  // fallback. This ensures we always pull from the live URL as requested.
  let links = Array.isArray(rawLinks) ? rawLinks : [];
  if (!links || links.length === 0) {
    for (
      let attempt = 1;
      attempt <= 3 && (!links || links.length === 0);
      attempt++
    ) {
      try {
        await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        const retryLinks = await page.evaluate(() => {
          function looksLikeHeaderText(s) {
            if (!s) return false;
            s = s.toString().trim();
            if (/^\d{4}$/.test(s)) return false;
            if (
              /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
                s,
              ) &&
              / - /.test(s)
            )
              return true;
            if (
              /^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s*-/.test(
                s,
              )
            )
              return true;
            return false;
          }

          const anchors = Array.from(document.querySelectorAll("a"))
            .filter((a) => {
              const t = (a.innerText || "").trim();
              return (
                /^(Prelims|Finals|Scores)$/i.test(t) && a.offsetParent !== null
              );
            })
            .map((a) => ({
              href: a.href,
              label: (a.innerText || "").trim(),
              node: a,
            }));

          const results = [];
          anchors.forEach(({ href, label, node }) => {
            let el = node;
            let title = null;

            function findHeaderFrom(node) {
              let cur = node.previousElementSibling;
              while (cur) {
                const txt = (cur.innerText || "").trim();
                if (looksLikeHeaderText(txt)) return txt;
                const header =
                  cur.querySelector &&
                  cur.querySelector("h1,h2,h3,h4,div,span");
                if (header) {
                  const ht = (header.innerText || "").trim();
                  if (looksLikeHeaderText(ht)) return ht;
                }
                cur = cur.previousElementSibling;
              }
              return null;
            }

            title = findHeaderFrom(el);
            if (!title) {
              let ancestor = el.parentElement;
              while (ancestor && ancestor !== document.body && !title) {
                title = findHeaderFrom(ancestor);
                ancestor = ancestor.parentElement;
              }
            }

            if (!title) {
              const all = Array.from(document.querySelectorAll("*"));
              const idx = all.indexOf(node);
              for (let i = idx - 1; i >= 0 && i > idx - 40; i--) {
                const txt = (all[i].innerText || "").trim();
                if (looksLikeHeaderText(txt)) {
                  title = txt;
                  break;
                }
              }
            }

            if (!title) return;
            const dashIndex = title.indexOf(" - ");
            const eventName =
              dashIndex >= 0 ? title.slice(dashIndex + 3).trim() : title.trim();

            // find year near the anchor
            function findYearFrom(node) {
              let cur = node.previousElementSibling;
              while (cur) {
                const t = (cur.innerText || "").trim();
                if (/^\d{4}$/.test(t)) return parseInt(t, 10);
                const desc =
                  cur.querySelector &&
                  Array.from(cur.querySelectorAll("*")).find((d) =>
                    /^\d{4}$/.test((d.innerText || "").trim()),
                  );
                if (desc) return parseInt((desc.innerText || "").trim(), 10);
                cur = cur.previousElementSibling;
              }
              const all = Array.from(document.querySelectorAll("*"));
              const idx = all.indexOf(node);
              for (let i = idx - 1; i >= 0 && i > idx - 80; i--) {
                const txt = (all[i].innerText || "").trim();
                if (/^\d{4}$/.test(txt)) return parseInt(txt, 10);
              }
              return null;
            }

            const year = findYearFrom(node) || null;
            const key = `${eventName} - ${label}`;
            results.push({ key, eventName, label, href, year });
          });
          const years = results.map((r) => r.year).filter((y) => y);
          if (years.length > 0) {
            const maxYear = Math.max(...years);
            return results.filter((r) => r.year === maxYear);
          }
          return results;
        });
        links = Array.isArray(retryLinks) ? retryLinks : links;
      } catch (e) {
        // swallow and retry
      }
    }
  }

  await browser.close();

  console.log("GIPA: Finished Scraping Event Links", (links || []).length);
  console.log(links);

  console.log("GIPA: Processing Recaps...");

  // Process each extracted recap link using the recapPool pattern
  const eventsPromises = (links || []).map(({ key, eventName, label, href }) =>
    (async () => {
      let recaps;
      try {
        console.log("GIPA: Enqueueing recap", href);
        recaps = await recapPool.enqueue(href);
      } catch (err) {
        console.error("GIPA: recap pool failed, falling back:", err);
        recaps = await processRecap(href);
      }
      // normalize numeric fields
      recaps.forEach((recap) => {
        recap.groups.forEach((group) => {
          group.captions = group.captions.map((c) => parseFloat(c));
          group.subtotal = parseFloat(group.subtotal);
          group.total = parseFloat(group.total);
        });
      });
      return {
        name: `${eventName} - ${label}`,
        recaps,
        circuit: "GIPA",
        recapUrl: href,
      };
    })(),
  );

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
// module no longer auto-runs getScore() on import

// Normalize text: collapse whitespace and trim
function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// Heuristic to decide whether a paragraph is an event header like "March 29 - Championships"
function looksLikeEventHeader(text) {
  if (!text) return false;
  // common pattern: "MonthName DD - Title" or "YYYY" (year lines) or "Month DD - Title"
  // We'll accept if it contains " - " (dash separator) and a month name or a number date.
  if (
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
      text,
    ) &&
    / - /.test(text)
  )
    return true;
  // fallback: if the text starts with a month word and number
  if (
    /^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s*-/i.test(
      text,
    )
  )
    return true;
  return false;
}
