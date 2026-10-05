'use strict';
// Demo-milestone screenshots: EQE PoC UI tabs (agentic-qe-mvp), the HTML tracker and demo-booking states.
// Usage: node scripts/screenshots.js [uiBase] [appBase]   (both servers must be running)
const path = require('path');
const { chromium } = require('@playwright/test');

const UI = process.argv[2] || 'http://127.0.0.1:3000';
const APP = process.argv[3] || 'http://127.0.0.1:4300';
const OUT = path.join(__dirname, '..', 'evidence', 'screenshots');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); console.log(`evidence/screenshots/${name}.png`); };
  for (const [tab, name] of [['run', '01-eqe-run'], ['jira&key=AQPI-3', '02-eqe-by-jira-item'], ['compare', '03-eqe-compare'], ['gaps', '04-eqe-gaps'], ['trail', '05-eqe-governance']]) {
    await page.goto(`${UI}/#/eqe?tab=${tab}`);
    await page.getByRole('heading', { name: 'EQE PoC · Stages 1-3' }).waitFor();
    await shot(name);
  }
  await page.goto(`${UI}/api/eqe/file?path=${encodeURIComponent('artifacts/AQPI-1/AQPI-1-analysis-and-progress.html')}`);
  await shot('06-stage1-tracker-html');
  await page.goto(APP);
  await page.getByRole('textbox', { name: 'Destination' }).fill('Lisbon');
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await page.getByRole('textbox', { name: 'Check-in' }).fill(day(30));
  await page.getByRole('textbox', { name: 'Check-out' }).fill(day(33));
  await page.getByRole('button', { name: 'Search hotels' }).click();
  await page.getByRole('heading', { name: /hotels available in Lisbon/ }).waitFor();
  await shot('07-demo-booking-results');
  await page.getByRole('textbox', { name: 'Check-in' }).fill(day(-1));
  await page.getByRole('textbox', { name: 'Check-out' }).fill(day(2));
  await page.getByRole('button', { name: 'Search hotels' }).click();
  await page.getByRole('alert').first().waitFor();
  await shot('08-demo-booking-validation');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
