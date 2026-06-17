const { chromium } = require('playwright');

/**
 * Autonomous Agent IC demo recording script.
 * 
 * This script captures the real product UI at 1920x1080
 * and navigates through the 8-10 demo beats automatically.
 * 
 * Run: node scripts/record_playwright.js
 */

const OUTPUT_DIR = 'demo-out/raw';
const DURATION = 130000; // 130 seconds total

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function recordDemo() {
  console.log('Starting Agent IC demo recording...');
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--window-size=1920,1080',
      '--window-position=0,0',
      '--no-sandbox',
      '--disable-gpu'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  // Navigate to product mode
  console.log('Navigating to product mode...');
  await page.goto('http://localhost:3000?productMode=true');
  await page.waitForLoadState('networkidle');
  await sleep(2000);

  // Beat 1: Hero (0:00-0:12) - Let the hero breathe
  console.log('Beat 1: Hero');
  await sleep(8000);

  // Beat 2: Select mission (0:12-0:22)
  console.log('Beat 2: Select mission');
  const missionCard = page.locator('.proposal-card').first();
  await missionCard.click();
  await sleep(3000);

  // Beat 3: Run mission / evaluate (0:22-0:30)
  console.log('Beat 3: Run mission');
  const runButton = page.locator('button:has-text("Run mission")');
  await runButton.click();
  await sleep(4000);

  // Beat 4: Approve spend envelope (0:30-0:42)
  console.log('Beat 4: Approve spend envelope');
  const spendButton = page.locator('button:has-text("Approve spend envelope")');
  await spendButton.click();
  await sleep(5000);

  // Scroll to see Stripe result
  await page.mouse.wheel(0, 300);
  await sleep(2000);

  // Beat 5: Trigger blocked action (0:42-0:52)
  console.log('Beat 5: Trigger blocked action');
  const blockedButton = page.locator('button:has-text("Trigger blocked action")');
  await blockedButton.click();
  await sleep(5000);

  // Beat 6: Import evidence (0:52-1:07)
  console.log('Beat 6: Import evidence');
  const evidenceButton = page.locator('button:has-text("Import evidence")');
  await evidenceButton.click();
  await sleep(4000);

  // Scroll to see evidence section
  await page.mouse.wheel(0, 400);
  await sleep(3000);

  // Beat 7: Show decision memo (1:07-1:17)
  console.log('Beat 7: Show decision memo');
  await page.mouse.wheel(0, 300);
  await sleep(4000);

  // Beat 8: Show saved playbook (1:17-1:29)
  console.log('Beat 8: Show saved playbook');
  await page.mouse.wheel(0, 400);
  await sleep(5000);

  // Beat 9: Show audit record (1:29-1:39)
  console.log('Beat 9: Show audit record');
  await page.mouse.wheel(0, 400);
  await sleep(4000);

  // Beat 10: Return to hero (1:39-1:54)
  console.log('Beat 10: Return to hero');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(6000);

  // Final pause
  console.log('Final pause...');
  await sleep(5000);

  console.log('Closing browser...');
  await context.close();
  await browser.close();

  console.log('Recording complete!');
  console.log(`Video saved to: ${OUTPUT_DIR}/`);
}

recordDemo().catch(err => {
  console.error('Recording failed:', err);
  process.exit(1);
});
