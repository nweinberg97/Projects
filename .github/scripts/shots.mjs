// Takes a screenshot of each project's live site, as listed in shots.json.
// Output goes to ./shots/<project>--<n>.jpg and is uploaded as a workflow artifact.
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync("shots.json", "utf8"));
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: cfg.viewport, colorScheme: "light", reducedMotion: "reduce" });

// Saves the icons a site declares (tab icon, app icon) plus a close-up of its header, to check logos.
async function saveLogos(page, name) {
  mkdirSync("shots/logos", { recursive: true });
  await page.screenshot({ path: `shots/logos/${name}--header.png`, clip: { x: 0, y: 0, width: 480, height: 110 } });
  const links = await page.$$eval('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]',
    (els) => els.map((e) => ({ rel: e.rel, href: e.href })));
  let n = 0;
  for (const l of links) {
    try {
      if (l.href.startsWith("data:")) {
        const [meta, data] = l.href.split(",");
        const ext = meta.includes("svg") ? "svg" : "png";
        const buf = meta.includes("base64") ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data));
        writeFileSync(`shots/logos/${name}--${n++}-${l.rel.replace(/\W+/g, "_")}.${ext}`, buf);
        continue;
      }
      const res = await page.request.get(l.href);
      if (!res.ok()) continue;
      const ext = (l.href.split("?")[0].split(".").pop() || "bin").slice(0, 4);
      writeFileSync(`shots/logos/${name}--${n++}-${l.rel.replace(/\W+/g, "_")}.${ext}`, await res.body());
    } catch {}
  }
  console.log("logos", name, links.length);
}

const only = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
for (const [name, views] of Object.entries(cfg.projects)) {
  if (only.length && !only.includes(name)) continue;
  for (const [i, v] of views.entries()) {
    const page = await ctx.newPage();
    const url = v.url || cfg.base + v.path;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => page.goto(url, { waitUntil: "load" }));
      await page.waitForTimeout(2500);
      for (const step of v.steps || []) {
        if (step.fill) await page.locator(step.fill[0]).fill(step.fill[1], { timeout: 10000 });
        if (step.click) await page.getByText(step.click, { exact: false }).first().click({ timeout: 10000 });
        await page.waitForTimeout(1500);
      }
      if (v.click) {
        await page.getByText(v.click, { exact: false }).first().click({ timeout: 10000 });
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2500);
      }
      await page.screenshot({ path: `shots/${name}--${i}.jpg`, type: "jpeg", quality: 85 });
      if (i === 0) await saveLogos(page, name);
      console.log("ok", name, i, page.url());
    } catch (e) {
      console.log("FAIL", name, i, url, String(e).slice(0, 160));
    }
    await page.close();
  }
}
await browser.close();
