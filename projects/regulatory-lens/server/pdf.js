import puppeteer from 'puppeteer';
import { buildReportHTML } from './reportTemplate.js';

// Use PUPPETEER_EXECUTABLE_PATH env var if set (required when Chromium not bundled)
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

export async function generatePDF(harmonisationResults, roadmap, selectedFrameworks, taxonomy) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    const html = buildReportHTML(harmonisationResults, roadmap, selectedFrameworks, taxonomy);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const result = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' }
    });
    // Puppeteer may return Uint8Array in newer versions — normalise to Buffer
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  } finally {
    await browser.close();
  }
}
