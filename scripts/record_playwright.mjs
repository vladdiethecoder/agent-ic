import { chromium } from 'playwright';

/**
 * Autonomous Agent IC demo recording script v3.
 * 
 * Records the real product UI at 1920x1080 with 10 distinct visual beats.
 * Total duration: ~115 seconds
 * 
 * Run: node scripts/record_playwright.mjs
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

  // Navigate to recording mode
  console.log('Navigating to recording mode...');
  await page.goto('http://localhost:3000?recording=true');
  await page.waitForLoadState('networkidle');
  await sleep(3000);

  // Beat 1: Hero (0:00-0:15) - Let the hero breathe, show receipt strip
  console.log('Beat 1: Hero + receipt strip (15s)');
  await sleep(15000);

  // Beat 2: Select mission (0:15-0:25)
  console.log('Beat 2: Select mission (10s)');
  const missionCard = page.locator('.proposal-card').first();
  await missionCard.click();
  await sleep(5000);
  // Scroll slightly to show workbench
  await page.mouse.wheel(0, 200);
  await sleep(5000);

  // Beat 3: Run mission / evaluate (0:25-0:38)
  console.log('Beat 3: Run mission (13s)');
  const runButton = page.locator('[data-testid="evaluate-agent-ic"]');
  await runButton.click();
  await sleep(8000);
  // Wait for evaluation to complete and show results
  await page.mouse.wheel(0, 200);
  await sleep(5000);

  // Beat 4: Approve spend envelope (0:38-0:55)
  console.log('Beat 4: Approve spend envelope (17s)');
  const spendButton = page.locator('[data-testid="authorize-stripe-spend"]');
  await spendButton.click();
  await sleep(8000);
  // Scroll to see Stripe result
  await page.mouse.wheel(0, 300);
  await sleep(5000);
  // Show the result
  await page.mouse.wheel(0, 200);
  await sleep(4000);

  // Beat 5: Trigger blocked action (0:55-1:10)
  console.log('Beat 5: Trigger blocked action (15s)');
  const blockedButton = page.locator('[data-testid="simulate-blocked-spend"]');
  await blockedButton.click();
  await sleep(8000);
  // Let the blocked banner be visible
  await page.mouse.wheel(0, 100);
  await sleep(7000);

  // Beat 6: Import evidence (1:10-1:30)
  console.log('Beat 6: Import evidence (20s)');
  const evidenceButton = page.locator('[data-testid="advance-roi-evidence"]');
  await evidenceButton.click();
  await sleep(5000);
  // Scroll to see evidence section
  await page.mouse.wheel(0, 400);
  await sleep(5000);
  // Show more evidence
  await page.mouse.wheel(0, 300);
  await sleep(5000);
  // Show the chart
  await page.mouse.wheel(0, 200);
  await sleep(5000);

  // Beat 7: Show decision memo (1:30-1:45)
  console.log('Beat 7: Show decision memo (15s)');
  await page.mouse.wheel(0, 300);
  await sleep(5000);
  // Show the big verdict
  await page.mouse.wheel(0, 200);
  await sleep(5000);
  // Show budget lines
  await page.mouse.wheel(0, 200);
  await sleep(5000);

  // Beat 8: Show saved playbook (1:45-2:00)
  console.log('Beat 8: Show saved playbook (15s)');
  await page.mouse.wheel(0, 500);
  await sleep(5000);
  // Show playbook details
  await page.mouse.wheel(0, 300);
  await sleep(5000);
  // Show board packet
  await page.mouse.wheel(0, 300);
  await sleep(5000);

  // Beat 9: Show audit record (2:00-2:12)
  console.log('Beat 9: Show audit record (12s)');
  await page.mouse.wheel(0, 400);
  await sleep(6000);
  // Show audit filters
  await page.mouse.wheel(0, 200);
  await sleep(6000);

  // Beat 10: Return to hero (2:12-2:30)
  console.log('Beat 10: Return to hero (18s)');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(10000);
  // Hero settle
  await sleep(8000);

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
