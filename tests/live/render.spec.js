import { test, expect } from '@playwright/test';
test('deployed Render: isolated guests share reactions, audio, chat, gameplay and rejoin', async ({
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
  ]);
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage())),
    errors = [];
  for (const page of [a, b]) {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.audioNotes = [];
      const Context = window.AudioContext ?? window.webkitAudioContext;
      if (!Context) return;
      const create = Context.prototype.createOscillator;
      Context.prototype.createOscillator = function (...args) {
        const node = create.apply(this, args),
          set = node.frequency.setValueAtTime.bind(node.frequency);
        node.frequency.setValueAtTime = (frequency, ...rest) => {
          window.audioNotes.push(frequency);
          return set(frequency, ...rest);
        };
        return node;
      };
    });
  }
  try {
    await a.goto(baseURL, { timeout: 60000 });
    await a.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Release Check A');
    await a.getByRole('button', { name: 'Let’s set the table' }).click();
    const code = await a.getByTestId('room-code').innerText();
    await b.goto(baseURL + '/?room=' + code, { timeout: 60000 });
    await b.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Release Check B');
    await b.getByRole('button', { name: 'Take your seat' }).click();
    await expect(a.getByRole('region', { name: 'Hinglish soundboard' })).toBeVisible();
    await a.getByRole('button', { name: 'Dhoka Dhoka', exact: true }).click();
    await expect(b.locator('.banter-line').last()).toContainText('Dhoka Dhoka');
    const id = await a.locator('.banter-line').last().getAttribute('data-event-id');
    await expect(b.locator('.banter-line').last()).toHaveAttribute('data-event-id', id);
    for (const page of [a, b])
      expect(await page.evaluate(() => window.audioNotes.filter((f) => f === 196).length)).toBe(2);
    await a.getByLabel('Chat message').fill('Release check: hello from A');
    await a.getByRole('button', { name: 'Send message' }).click();
    await expect(b.getByRole('log')).toContainText('hello from A');
    await b.getByLabel('Chat message').fill('Release check: hello from B');
    await b.getByRole('button', { name: 'Send message' }).click();
    await expect(a.getByRole('log')).toContainText('hello from B');
    await a.getByRole('button', { name: 'Everyone here? Let’s play' }).click();
    await expect(b.locator('.roll-button')).toBeVisible();
    let moved = false;
    for (let attempt = 0; attempt < 24 && !moved; attempt++) {
      const actor = (await a.locator('.roll-button').isEnabled()) ? a : b;
      await actor.getByRole('button', { name: 'Roll the dice', exact: true }).click();
      await expect
        .poll(
          async () =>
            (await actor.getByTestId('legal-token').count()) ||
            (await a.locator('.roll-button').isEnabled()) ||
            (await b.locator('.roll-button').isEnabled()),
        )
        .toBeTruthy();
      if (await actor.getByTestId('legal-token').count()) {
        const name = (
          await actor.getByTestId('legal-token').first().getAttribute('aria-label')
        ).split(',')[0];
        await actor.getByTestId('legal-token').first().click();
        for (const page of [a, b])
          await expect(
            page.getByRole('button', { name: name + ', step 0', exact: true }),
          ).toBeVisible();
        moved = true;
      }
    }
    expect(moved).toBe(true);
    await b.reload();
    await expect(b.getByTestId('room-code')).toHaveText(code);
    await expect(b.getByRole('log')).toContainText('hello from A');
    await expect(b.locator('.banter-line')).toHaveCount(0);
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await a.screenshot({ path: 'test-results/render-desktop.png', fullPage: true });
    await b.screenshot({ path: 'test-results/render-mobile.png', fullPage: true });
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});
