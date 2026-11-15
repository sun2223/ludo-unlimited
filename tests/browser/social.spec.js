import { test, expect } from '@playwright/test';
test.use({ baseURL: 'http://localhost:4273' });
const headers = { 'x-ludo-fixture': 'local-animation-test' };
async function table(browser) {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
  ]);
  const [a, b] = await Promise.all(contexts.map((context) => context.newPage()));
  for (const page of [a, b])
    await page.addInitScript(() => {
      window.audioNotes = [];
      const Context = window.AudioContext ?? window.webkitAudioContext;
      if (!Context) return;
      const create = Context.prototype.createOscillator;
      Context.prototype.createOscillator = function (...args) {
        const oscillator = create.apply(this, args),
          set = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (frequency, ...rest) => {
          window.audioNotes.push(frequency);
          return set(frequency, ...rest);
        };
        return oscillator;
      };
    });
  const errors = [];
  for (const page of [a, b]) page.on('pageerror', (error) => errors.push(error.message));
  await a.goto('/');
  await a.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Social Alice');
  await a.getByRole('button', { name: 'Let’s set the table' }).click();
  const code = await a.getByTestId('room-code').innerText();
  await b.goto('/?room=' + code);
  await b.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Social Bob');
  await b.getByRole('button', { name: 'Take your seat' }).click();
  await expect(a.getByRole('button', { name: 'Everyone here? Let’s play' })).toBeEnabled();
  await a.getByRole('button', { name: 'Everyone here? Let’s play' }).click();
  await expect(b.locator('.roll-button')).toBeVisible();
  return { contexts, a, b, code, errors };
}
async function seed(request, a, code, data) {
  await request.post('/__test/seed', { headers, data: { code, ...data } });
  const index = data.tokens ? data.tokens.length - 1 : 0;
  await expect(a.locator('.token').nth(index)).toHaveAttribute(
    'data-progress',
    String(data.tokens ? data.tokens[index] : data.from),
  );
}
async function rollMove(page, index = 1) {
  await page.getByRole('button', { name: 'Roll the dice', exact: true }).click();
  await page.getByRole('button', { name: 'Move token ' + index, exact: true }).click();
  await expect(page.locator('.room-main')).toHaveAttribute('data-phase', 'idle');
}
test('social: all six soundboard effects synchronize, replay once, expire and stay isolated', async ({
  browser,
  request,
}) => {
  const { contexts, a, b, code, errors } = await table(browser),
    foreign = await browser.newContext();
  try {
    const c = await foreign.newPage();
    await c.goto('/');
    await c.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Other table');
    await c.getByRole('button', { name: 'Let’s set the table' }).click();
    let lastId;
    for (const label of [
      'Dhoka Dhoka',
      'Ruk Ja Beta',
      'Aayega Aayega',
      'Wah Bete Wah',
      'Sher Ki Entry',
      'Game Over Bhai',
    ]) {
      await a.getByRole('button', { name: label, exact: true }).click();
      await expect(b.locator('.banter-line').last()).toContainText(label);
      const last = a.locator('.banter-line').last();
      lastId = await last.getAttribute('data-event-id');
      await expect(b.locator('.banter-line').last()).toHaveAttribute('data-event-id', lastId);
      expect(await last.innerText()).toBe(await b.locator('.banter-line').last().innerText());
    }
    const counts = await Promise.all(
      [a, b].map((page) => page.evaluate(() => window.audioNotes.length)),
    );
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[0]).toBe(counts[1]);
    await request.post('/__test/social-replay', { headers, data: { code, id: lastId } });
    await request.post('/__test/social-replay', {
      headers,
      data: { code, id: lastId, expired: true },
    });
    for (const [index, page] of [a, b].entries()) {
      expect(await page.evaluate(() => window.audioNotes.length)).toBe(counts[index]);
      await expect(page.locator(`[data-event-id="${lastId}"]`)).toHaveCount(1);
      await expect(page.locator('[data-event-id$="-expired"]')).toHaveCount(0);
    }
    await expect(c.locator('.banter-line')).toHaveCount(0);
    await a.getByLabel('Chat message').fill('Banter ke saath strategy bhi!');
    await a.getByRole('button', { name: 'Send message' }).click();
    await expect(b.getByRole('log')).toContainText('Banter ke saath strategy bhi!');
    await b.emulateMedia({ reducedMotion: 'reduce' });
    await b.getByRole('button', { name: 'Send 🔥 reaction' }).click();
    for (const page of [a, b]) await expect(page.locator('.emoji-sky span')).toHaveText('🔥');
    const id = await a.locator('.emoji-sky span').getAttribute('data-reaction-id');
    await expect(b.locator('.emoji-sky span')).toHaveAttribute('data-reaction-id', id);
    expect(
      await a.locator('.emoji-sky').evaluate((node) => getComputedStyle(node).pointerEvents),
    ).toBe('none');
    expect(
      await b.locator('.emoji-sky span').evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
    await a.getByRole('button', { name: 'Roll the dice', exact: true }).click();
    await expect(a.locator('.turn-copy p')).not.toContainText('The match is on');
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([...contexts, foreign].map((context) => context.close()));
  }
});
test('social: auto controls, slow turns, captures, revenge, victory, refresh and rematch', async ({
  browser,
  request,
}) => {
  const { contexts, a, b, code, errors } = await table(browser);
  try {
    await seed(request, a, code, { from: -1, roll: 1 });
    await a.getByRole('button', { name: 'Roll the dice', exact: true }).click();
    await expect(b.locator('.banter-line').last()).toContainText('Sabr ka test');
    expect(await a.locator('.banter-line').last().innerText()).toBe(
      await b.locator('.banter-line').last().innerText(),
    );
    await b.getByLabel('Sound settings').click();
    await b.getByLabel('Automatic banter').uncheck();
    await b.getByLabel('Sound settings').click();
    await expect(b.locator('.banter-line')).toHaveCount(0);
    await seed(request, a, code, { from: -1, roll: 6 });
    await a.getByRole('button', { name: 'Roll the dice', exact: true }).click();
    await expect(a.locator('.banter-line').last()).toContainText('Chhe aa gaya');
    await expect(b.locator('.banter-line')).toHaveCount(0);
    await a.getByRole('button', { name: 'Dhoka Dhoka', exact: true }).click();
    await expect(b.locator('.banter-line').last()).toContainText('Dhoka Dhoka');
    await b.getByLabel('Sound settings').click();
    await b.getByLabel('Automatic banter').check();
    await b.getByLabel('Sound settings').click();
    await request.post('/__test/slow', { headers, data: { code } });
    await expect(b.locator('.banter-line').last()).toContainText('Captain, hello?');
    await seed(request, a, code, { from: 12, roll: 2, enemy: [1, -1, -1, -1] });
    await rollMove(a);
    for (const page of [a, b])
      await expect(
        page
          .getByRole('region', { name: 'Badla Board' })
          .getByRole('row')
          .filter({ hasText: 'Social Alice' })
          .locator('td')
          .first(),
      ).toHaveText('1');
    await seed(request, a, code, { from: 14, roll: 1, turn: 1, enemy: [0, -1, -1, -1] });
    await rollMove(b);
    for (const page of [a, b]) {
      await expect(page.locator('.banter-line').filter({ hasText: 'Badla delivered' })).toHaveCount(
        1,
      );
      const row = page
        .getByRole('region', { name: 'Badla Board' })
        .getByRole('row')
        .filter({ hasText: 'Social Bob' });
      await expect(row.locator('td')).toHaveText(['1', '1', '1']);
    }
    await seed(request, a, code, { tokens: [56, 56, 56, 44], roll: 1 });
    await rollMove(a, 4);
    await expect(b.locator('.banter-line').last()).toContainText('Final lap');
    await seed(request, a, code, { tokens: [56, 56, 56, 55], roll: 1 });
    await rollMove(a, 4);
    await expect(b.locator('.banter-line').last()).toContainText('Champion scene');
    await a.screenshot({ path: 'test-results/banter-desktop.png', fullPage: true });
    await b.screenshot({ path: 'test-results/banter-mobile.png', fullPage: true });
    await b.reload();
    await expect(b.getByTestId('room-code')).toHaveText(code);
    await expect(b.locator('.banter-line')).toHaveCount(0);
    await expect(
      b
        .getByRole('region', { name: 'Badla Board' })
        .getByRole('row')
        .filter({ hasText: 'Social Bob' })
        .locator('td'),
    ).toHaveText(['1', '1', '1']);
    await a.getByRole('button', { name: 'One more game?' }).click();
    for (const page of [a, b])
      await expect(
        page
          .getByRole('region', { name: 'Badla Board' })
          .getByRole('row')
          .filter({ hasText: 'Social Bob' })
          .locator('td'),
      ).toHaveText(['0', '0', '0']);
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
