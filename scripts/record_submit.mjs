import { chromium } from 'playwright';

/**
 * Autonomous Agent IC demo recording script v3.
 * Records the /submit page with 10 distinct visual beats.
 * Total duration: ~115 seconds
 */

const OUTPUT_DIR = 'demo-out/raw';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function recordDemo() {
  console.log('Starting Agent IC demo recording v3...');
  
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

  // Navigate to submit page
  console.log('Navigating to /submit...');
  await page.goto('http://localhost:3000/submit');
  await page.waitForLoadState('networkidle');
  await sleep(3000);

  // Beat 1: Hero (0:00-0:15)
  console.log('Beat 1: Hero (15s)');
  await sleep(15000);

  // Beat 2: Mission panel (0:15-0:25)
  console.log('Beat 2: Mission (10s)');
  await page.mouse.wheel(0, 400);
  await sleep(5000);
  await page.mouse.wheel(0, 200);
  await sleep(5000);

  // Beat 3: Run evaluation (0:25-0:38)
  console.log('Beat 3: Run evaluation (13s)');
  const runButton = page.locator('button').filter({ hasText: /Run capital experiment|Running/ });
  await runButton.click();
  await sleep(8000);
  await page.mouse.wheel(0, 300);
  await sleep(5000);

  // Beat 4: Spend envelope (0:38-0:55)
  console.log('Beat 4: Spend envelope (17s)');
  const spendButton = page.locator('button').filter({ hasText: /Create Stripe session|Stripe session created/ });
  await spendButton.click();
  await sleep(8000);
  await page.mouse.wheel(0, 300);
  await sleep(5000);
  await page.mouse.wheel(0, 200);
  await sleep(4000);

  // Beat 5: Blocked action (0:55-1:10)
  console.log('Beat 5: Blocked action (15s)');
  const blockedButton = page.locator('button').filter({ hasText: /Simulate blocked spend|Blocked event recorded/ });
  await blockedButton.click();
  await sleep(8000);
  await page.mouse.wheel(0, 200);
  await sleep(7000);

  // Beat 6: Evidence (1:10-1:30)
  console.log('Beat 6: Evidence (20s)');
  const evidenceButton = page.locator('button').filter({ hasText: /Import evidence/ });
  await evidenceButton.click();
  await sleep(5000);
  await page.mouse.wheel(0, 400);
  await sleep(5000);
  await page.mouse.wheel(0, 300);
  await sleep(5000);
  await page.mouse.wheel(0, 200);
  await sleep(5000);

  // Beat 7: Capital decision (1:30-1:45)
  console.log('Beat 7: Capital decision (15s)');
  await page.mouse.wheel(0, 400);
  await sleep(5000);
  await page.mouse.wheel(0, 300);
  await sleep(5000);
  await page.mouse.wheel(0, 200);
  await sleep(5000);

  // Beat 8: Hermes playbook (1:45-2:00)
  console.log('Beat 8: Hermes playbook (15s)');
  await page.mouse.wheel(0, 400);
  await sleep(5000);
  await page.mouse.wheel(0, 300);
  await sleep(5000);
  await page.mouse.wheel(0, 200);
  await sleep(5000);

  // Beat 9: Audit (2:00-2:12)
  console.log('Beat 9: Audit (12s)');
  await page.mouse.wheel(0, 400);
  await sleep(6000);
  await page.mouse.wheel(0, 200);
  await sleep(6000);

  // Beat 10: Return to hero (2:12-2:30)
  console.log('Beat 10: Return to hero (18s)');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(10000);
  await sleep(8000);

  console.log('Closing browser...');
  await context.close();
  await browser.close();

  console.log('Recording complete!');
}

recordDemo().catch(err => {
  console.error('Recording failed:', err);
  process.exit(1);
});
