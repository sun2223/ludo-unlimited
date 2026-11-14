import { test, expect } from '@playwright/test';
test('isolated desktop/mobile sessions create, join, chat, play and rejoin', async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
  ]);
  const [alice, bob] = await Promise.all(contexts.map((c) => c.newPage()));
  const errors = [];
  for (const page of [alice, bob]) page.on('pageerror', (e) => errors.push(e.message));
  try {
    await alice.goto('/');
    await alice.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Alice');
    await alice.getByRole('button', { name: 'Let’s set the table' }).click();
    const code = await alice.getByTestId('room-code').innerText();
    await bob.goto('/?room=' + code);
    await bob.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Bob');
    await bob.getByRole('button', { name: 'Take your seat' }).click();
    await expect(alice.locator('.seat').filter({ hasText: 'Bob' })).toBeVisible();
    await expect(bob.getByTestId('room-code')).toHaveText(code);
    await bob.getByLabel('Chat message').fill('Hello from another browser!');
    await bob.getByRole('button', { name: 'Send message' }).click();
    await expect(alice.getByRole('log')).toContainText('Hello from another browser!');
    await alice.getByRole('button', { name: 'Everyone here? Let’s play' }).click();
    await expect(bob.getByRole('heading', { name: 'Let the good times roll.' })).toBeVisible();
    let moved = false;
    for (let attempt = 0; attempt < 70 && !moved; attempt++) {
      const actor = (await alice
        .locator('.roll-button')
        .isEnabled()
        .catch(() => false))
        ? alice
        : bob;
      await actor.getByRole('button', { name: 'Roll the dice', exact: true }).click();
      await expect
        .poll(
          async () =>
            (await actor.getByTestId('legal-token').count()) ||
            (await alice
              .locator('.roll-button')
              .isEnabled()
              .catch(() => false)) ||
            (await bob
              .locator('.roll-button')
              .isEnabled()
              .catch(() => false)),
        )
        .toBeTruthy();
      if (await actor.getByTestId('legal-token').count()) {
        const label = await actor.getByTestId('legal-token').first().getAttribute('aria-label'),
          tokenName = label.split(',')[0];
        await actor.getByTestId('legal-token').first().click();
        for (const page of [alice, bob])
          await expect(
            page.getByRole('button', { name: tokenName + ', step 0', exact: true }),
          ).toBeVisible();
        moved = true;
      }
    }
    expect(moved).toBe(true);
    await contexts[1].setOffline(true);
    await expect(alice.locator('.seat').filter({ hasText: 'Bob' })).toContainText('Reconnecting', {
      timeout: 60000,
    });
    await contexts[1].setOffline(false);
    await bob.reload();
    await expect(bob.getByTestId('room-code')).toHaveText(code);
    await expect(alice.locator('.seat').filter({ hasText: 'Bob' })).not.toContainText(
      'Reconnecting',
    );
    await expect(bob.getByRole('log')).toContainText('Hello from another browser!');
    expect(await bob.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await alice.screenshot({ path: 'test-results/desktop-room.png', fullPage: true });
    await bob.screenshot({ path: 'test-results/mobile-room.png', fullPage: true });
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});
test('landing, rules and invalid room feedback', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/desktop-landing.png', fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Let’s play', exact: true }).click();
  await page.getByRole('tab', { name: 'Join friends' }).click();
  await page.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Guest');
  await page.getByLabel('YOUR INVITE CODE').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Take your seat' }).click();
  await expect(page.getByRole('alert')).toContainText('Room not found');
  expect(errors).toEqual([]);
});

test('four isolated browsers synchronize the table and transfer host controls on reconnect', async ({
  browser,
}) => {
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    await pages[0].goto('/');
    await pages[0].getByLabel('WHAT SHOULD WE CALL YOU?').fill('Host Alice');
    await pages[0].getByRole('button', { name: 'Let’s set the table' }).click();
    const code = await pages[0].getByTestId('room-code').innerText();
    for (let i = 1; i < 4; i++) {
      await pages[i].goto('/?room=' + code);
      await pages[i].getByLabel('WHAT SHOULD WE CALL YOU?').fill(['', 'Bob', 'Cara', 'Dan'][i]);
      await pages[i].getByRole('button', { name: 'Take your seat' }).click();
    }
    for (const page of pages.slice(0, 4)) {
      await expect(page.locator('.seat:not(.empty)')).toHaveCount(4);
      await expect(page.locator('.token')).toHaveCount(16);
    }
    await pages[4].goto('/?room=' + code);
    await pages[4].getByLabel('WHAT SHOULD WE CALL YOU?').fill('Extra Guest');
    await pages[4].getByRole('button', { name: 'Take your seat' }).click();
    await expect(pages[4].getByRole('alert')).toContainText('room is full');
    await pages[0].close();
    await expect(pages[1].locator('.seat').filter({ hasText: 'Bob' })).toContainText('Host');
    pages[0] = await contexts[0].newPage();
    await pages[0].goto('/');
    await expect(pages[0].getByTestId('room-code')).toHaveText(code);
    await expect(pages[0].getByRole('button', { name: 'Everyone here? Let’s play' })).toBeEnabled();
    await pages[0].getByRole('button', { name: 'Everyone here? Let’s play' }).click();
    for (const page of pages.slice(0, 4))
      await expect(page.getByRole('heading', { name: 'Let the good times roll.' })).toBeVisible();
    await pages[0].getByRole('button', { name: 'Roll the dice', exact: true }).click();
    for (const page of pages.slice(0, 4))
      await expect(page.locator('.turn-copy p')).not.toContainText('The match is on');
    const results = await Promise.all(
      pages.slice(0, 4).map((page) => page.locator('.turn-copy p').innerText()),
    );
    expect(new Set(results).size).toBe(1);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
