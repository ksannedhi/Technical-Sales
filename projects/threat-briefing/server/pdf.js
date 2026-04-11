import puppeteer from 'puppeteer';
import { buildReportHTML } from './reportTemplate.js';

// Reuse the Chromium already cached on this machine
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  'C:\\Users\\ksann\\.cache\\puppeteer\\chrome\\win64-146.0.7680.153\\chrome-win64\\chrome.exe';

export async function generatePDF(briefing) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildReportHTML(briefing), { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' }
    });
    // Puppeteer v22+ returns Uint8Array — convert to Buffer for Express res.send()
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
