// Takes a screenshot of each project's live site, as listed in shots.json.
// Output goes to ./shots/<project>--<n>.jpg and is uploaded as a workflow artifact.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const cfg = JSON.parse(readFileSync("shots.json", "utf8"));
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: cfg.viewport, colorScheme: "light", reducedMotion: "reduce" });

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
      console.log("ok", name, i, page.url());
    } catch (e) {
      console.log("FAIL", name, i, url, String(e).slice(0, 160));
    }
    await page.close();
  }
}
await browser.close();
