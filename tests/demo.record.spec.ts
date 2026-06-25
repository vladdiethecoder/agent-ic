import { test, expect } from '@playwright/test';

/**
 * Autonomous Agent IC demo recording spec.
 * 
 * This Playwright test captures the real product UI at 1920x1080
 * and navigates through the 8-10 demo beats automatically.
 * 
 * Run: npx playwright test tests/demo.record.spec.ts --project=chromium
 */

test('Agent IC demo capture', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    recordVideo: {
      dir: 'demo-out/raw',
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  // Navigate to product mode
  await page.goto('http://localhost:3000?productMode=true');
  await page.waitForLoadState('networkidle');

  // Beat 1: Hero (0:00-0:12) - Let the hero breathe
  await page.waitForTimeout(3000);

  // Beat 2: Select mission (0:12-0:22)
  const missionCard = page.locator('.proposal-card').first();
  await missionCard.click();
  await page.waitForTimeout(2000);

  // Beat 3: Run mission / evaluate (0:22-0:30)
  const runButton = page.locator('button:has-text("Run mission")');
  await runButton.click();
  await page.waitForTimeout(3000);

  // Beat 4: Approve spend envelope (0:30-0:42)
  const spendButton = page.locator('button:has-text("Approve spend envelope")');
  await spendButton.click();
  await page.waitForTimeout(4000);

  // Scroll to see Stripe result
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(2000);

  // Beat 5: Trigger blocked action (0:42-0:52)
  const blockedButton = page.locator('button:has-text("Trigger blocked action")');
  await blockedButton.click();
  await page.waitForTimeout(4000);

  // Beat 6: Import evidence (0:52-1:07)
  const evidenceButton = page.locator('button:has-text("Import evidence")');
  await evidenceButton.click();
  await page.waitForTimeout(3000);

  // Scroll to see evidence section
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(3000);

  // Beat 7: Show decision memo (1:07-1:17)
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(3000);

  // Beat 8: Show saved playbook (1:17-1:29)
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(4000);

  // Beat 9: Show audit record (1:29-1:39)
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(3000);

  // Beat 10: Return to hero (1:39-1:54)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(5000);

  // Final pause
  await page.waitForTimeout(3000);

  await context.close();
});
