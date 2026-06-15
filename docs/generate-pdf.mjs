import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "install-dashboard-guide.html");
const pdfPath = path.join(__dirname, "install-dashboard-guide.pdf");

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
await page.pdf({
  path: pdfPath,
  format: "Letter",
  printBackground: true,
  margin: { top: "0.5in", right: "0.6in", bottom: "0.6in", left: "0.6in" },
});
await browser.close();
console.log(`PDF written to: ${pdfPath}`);
