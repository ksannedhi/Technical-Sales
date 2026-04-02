import puppeteer from 'puppeteer';
import { buildReportHtml } from './reportTemplate.js';

export async function buildReportBuffer(result) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildReportHtml(result), {
      waitUntil: 'networkidle0'
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '14mm',
        right: '10mm',
        bottom: '14mm',
        left: '10mm'
      }
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
