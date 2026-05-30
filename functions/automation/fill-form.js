// Requires Lambda layer: @sparticuz/chromium + playwright-core
import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

export const handler = async (event) => {
  let browser;
  try {
    const { url, fields, submitSelector } = parseBody(event);

    if (!url || !fields) {
      return errorResponse(event, 400, 'Missing required fields: url, fields');
    }

    // Validate URL scheme to prevent SSRF
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return errorResponse(event, 400, 'URL must use http or https');
    }

    const parsedFields =
      typeof fields === 'string' ? JSON.parse(fields) : fields;

    browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

    for (const [selector, value] of Object.entries(parsedFields)) {
      await page.fill(selector, String(value));
    }

    if (submitSelector) {
      await page.click(submitSelector);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    }

    return bedrockResponse(event, 200, 'Form filled successfully', {
      finalUrl: page.url(),
    });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  } finally {
    if (browser) await browser.close();
  }
};
