import { test, expect } from '@playwright/test';
import { ANIMATION } from '../../shared/animation.js';
test.use({ baseURL: 'http://localhost:4273' });
const headers = { 'x-ludo-fixture': 'local-animation-test' };
async function table(browser) {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
  ]);
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
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
  await a.goto('/');
  await a.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Motion Alice');
  await a.getByRole('button', { name: 'Let’s set the table' }).click();
  const code = await a.getByTestId('room-code').innerText();
  await b.goto('/?room=' + code);
  await b.getByLabel('WHAT SHOULD WE CALL YOU?').fill('Motion Bob');
  await b.getByRole('button', { name: 'Take your seat' }).click();
  await expect(a.getByRole('button', { name: 'Everyone here? Let’s play' })).toBeEnabled();
  await a.getByRole('button', { name: 'Everyone here? Let’s play' }).click();
  await expect(b.locator('.roll-button')).toBeVisible();
  return { contexts, a, b, code };
}
async function observe(page) {
  await page.evaluate(() => {
    window.hops = [];
    window.motionSamples = [];
    window.hopObserver?.disconnect();
    window.recordMotion = true;
    function sample() {
      const token = document.querySelector('.token.in-motion');
      if (token) {
        const rect = token.getBoundingClientRect(),
          board = token.closest('.board').getBoundingClientRect();
        window.motionSamples.push(
          Math.abs(
            rect.x +
              rect.width / 2 -
              (board.x + (parseFloat(token.style.left) * board.width) / 100),
          ) +
            Math.abs(
              rect.y +
                rect.height / 2 -
                (board.y + (parseFloat(token.style.top) * board.height) / 100),
            ),
        );
      }
      if (window.recordMotion) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
    const board = document.querySelector('.board');
    window.hopObserver = new MutationObserver((records) => {
      for (const record of records)
        if (record.attributeName === 'data-progress') {
          const node = record.target;
          if (node.dataset.token?.endsWith(':0') && node.classList.contains('in-motion'))
            window.hops.push({
              progress: Number(node.dataset.progress),
              hop: Number(node.dataset.hop),
              at: performance.now(),
            });
        }
    });
    window.hopObserver.observe(board, { subtree: true, attributes: true });
  });
}
for (const [from, roll] of [
  [2, 1],
  [3, 3],
  [2, 6],
  [50, 3],
])
  test(`presentation: ${roll} cell hops from ${from} synchronize in two browsers`, async ({
    browser,
    request,
  }) => {
    const { contexts, a, b, code } = await table(browser);
    try {
      const errors = [];
      [a, b].forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
      const seed = await (
        await request.post('/__test/seed', { headers, data: { code, from, roll } })
      ).json();
      await expect(a.locator('.token').first()).toHaveAttribute('data-progress', String(from));
      await expect(b.locator('.token').first()).toHaveAttribute('data-progress', String(from));
      await a.getByRole('button', { name: 'Roll the dice', exact: true }).click();
      await expect(a.getByTestId('legal-token').first()).toBeEnabled();
      await observe(a);
      await observe(b);
      await a.getByRole('button', { name: 'Move token 1', exact: true }).dblclick();
      await expect(a.locator('.room-main')).toHaveAttribute('data-phase', 'moving');
      await expect(a.locator('.roll-button')).toBeDisabled();
      for (const page of [a, b]) {
        await expect(page.locator('.room-main')).toHaveAttribute('data-phase', 'idle');
        await expect(page.locator('.token').first()).toHaveAttribute(
          'data-progress',
          String(from + roll),
        );
        const hops = await page.evaluate(() => {
          window.recordMotion = false;
          return window.hops;
        });
        expect(hops.map((h) => h.progress)).toEqual(
          Array.from({ length: roll }, (_, i) => from + i + 1),
        );
        for (let i = 1; i < hops.length; i++)
          expect(hops[i].at - hops[i - 1].at).toBeGreaterThan(ANIMATION.STEP_MS - 65);
      }
      expect(await a.evaluate(() => window.motionSamples.some((distance) => distance > 1))).toBe(
        true,
      );
      const state = await (await request.get('/__test/state/' + code, { headers })).json();
      expect(state.game.version).toBe(seed.version + 2);
      expect(errors).toEqual([]);
      await b.reload();
      await expect(b.getByTestId('room-code')).toHaveText(code);
      await expect(b.locator('.room-main')).toHaveAttribute('data-phase', 'idle');
      await expect(b.locator('.token').first()).toHaveAttribute(
        'data-progress',
        String(from + roll),
      );
    } finally {
      await Promise.allSettled(contexts.map((c) => c.close()));
    }
  });
test('presentation: reduced motion restores the final board without intermediate hops', async ({
  browser,
  request,
}) => {
  const { contexts, a, b, code } = await table(browser);
  try {
    await a.emulateMedia({ reducedMotion: 'reduce' });
    await request.post('/__test/seed', { headers, data: { code, from: 2, roll: 6 } });
    await expect(a.locator('.token').first()).toHaveAttribute('data-progress', '2');
    await a.getByRole('button', { name: 'Roll the dice', exact: true }).click();
    await expect(a.locator('.dice-stage')).not.toHaveClass(/rolling/);
    await expect(a.getByTestId('legal-token').first()).toBeEnabled();
    await observe(a);
    await a.getByRole('button', { name: 'Move token 1', exact: true }).click();
    await expect(a.locator('.token').first()).toHaveAttribute('data-progress', '8');
    expect(await a.evaluate(() => window.hops)).toEqual([]);
    await expect(b.locator('.token').first()).toHaveAttribute('data-progress', '8');
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});

test('presentation: capture and win sounds, live celebration, saved audio controls and rematch', async ({
  browser,
  request,
}) => {
  const { contexts, a, b, code } = await table(browser);
  try {
    await request.post('/__test/seed', {
      headers,
      data: { code, from: 12, roll: 2, enemy: [1, -1, -1, -1] },
    });
    await expect(a.locator('.token').first()).toHaveAttribute('data-progress', '12');
    await a.getByRole('button', { name: 'Roll the dice', exact: true }).click();
    await expect(a.locator('.dice-stage')).toHaveClass(/rolling/);
    await expect(a.locator('.room-main')).toHaveAttribute('data-phase', 'rolling');
    await expect(a.getByTestId('legal-token').first()).toBeEnabled();
    await a.evaluate(() => (window.audioNotes = []));
    await a.getByRole('button', { name: 'Move token 1', exact: true }).click();
    await expect(a.locator('.room-main')).toHaveAttribute('data-phase', 'idle');
    await expect(a.locator('.token').first()).toHaveAttribute('data-progress', '14');
    expect((await a.evaluate(() => window.audioNotes)).filter((f) => f === 640)).toHaveLength(2);
    expect(await a.evaluate(() => window.audioNotes)).toContain(740);
    await expect(b.locator('.token').nth(4)).toHaveAttribute('data-progress', '-1');
    await b.evaluate(() => (window.audioNotes = []));
    await a.getByLabel('Chat message').fill('Beautiful move!');
    await a.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => b.evaluate(() => window.audioNotes.includes(1175))).toBe(true);
    await request.post('/__test/seed', {
      headers,
      data: { code, roll: 1, tokens: [56, 56, 56, 55] },
    });
    await expect(a.locator('.token').nth(3)).toHaveAttribute('data-progress', '55');
    await a.getByRole('button', { name: 'Roll the dice', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Move token 4', exact: true })).toBeEnabled();
    await a.evaluate(() => (window.audioNotes = []));
    await a.getByRole('button', { name: 'Move token 4', exact: true }).click();
    await expect(a.locator('.confetti i')).toHaveCount(36);
    await expect(b.locator('.win-banner')).toContainText('Motion Alice wins');
    await a.screenshot({ path: 'test-results/premium-win.png', fullPage: true });
    expect(await a.evaluate(() => window.audioNotes)).toContain(1047);
    await a.getByLabel('Sound settings').click();
    await a.getByRole('button', { name: 'Mute sound', exact: true }).click();
    await a.getByLabel('Sound volume').fill('22');
    await a.reload();
    await expect(a.getByTestId('room-code')).toHaveText(code);
    await expect(a.locator('.confetti i')).toHaveCount(0);
    await a.getByLabel('Sound settings').click();
    await expect(a.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible();
    await expect(a.getByLabel('Sound volume')).toHaveValue('22');
    await a.getByRole('button', { name: 'One more game?' }).click();
    for (const page of [a, b]) {
      await expect(page.locator('.win-banner')).toHaveCount(0);
      await expect(page.locator('.token').first()).toHaveAttribute('data-progress', '-1');
    }
    await a.getByLabel('Sound settings').click();
    await a.screenshot({ path: 'test-results/premium-desktop.png', fullPage: true });
    await b.screenshot({ path: 'test-results/premium-mobile.png', fullPage: true });
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});

test('presentation: refreshing during a six-hop move snaps to the committed result', async ({
  browser,
  request,
}) => {
  const { contexts, a, b, code } = await table(browser);
  try {
    await request.post('/__test/seed', { headers, data: { code, from: 2, roll: 6 } });
    await expect(a.locator('.token').first()).toHaveAttribute('data-progress', '2');
    await a.getByRole('button', { name: 'Roll the dice', exact: true }).click();
    await expect(a.locator('.dice-stage')).toHaveClass(/rolling/);
    await expect(a.locator('.room-main')).toHaveAttribute('data-phase', 'rolling');
    await expect(a.getByTestId('legal-token').first()).toBeEnabled();
    await a.getByRole('button', { name: 'Move token 1', exact: true }).click();
    await expect(a.locator('.room-main')).toHaveAttribute('data-phase', 'moving');
    await a.reload();
    await expect(a.getByTestId('room-code')).toHaveText(code);
    await expect(a.locator('.room-main')).toHaveAttribute('data-phase', 'idle');
    await expect(a.locator('.token').first()).toHaveAttribute('data-progress', '8');
    expect(await a.evaluate(() => window.audioNotes)).toEqual([]);
    await expect(b.locator('.room-main')).toHaveAttribute('data-phase', 'idle');
    await expect(b.locator('.token').first()).toHaveAttribute('data-progress', '8');
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});
