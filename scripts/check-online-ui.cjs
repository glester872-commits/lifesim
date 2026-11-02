// npm i --no-save playwright, or set PLAYWRIGHT_MODULE to an installed copy.
// Uses real browser focus, pointer/keyboard activation and a local room server; no game or external services.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = `<!doctype html><html><head><link rel="icon" href="data:,"><link rel="stylesheet" href="/src/style.css"></head><body>
<main id="app"></main><button id="outside">Fuera del panel</button>
<script type="module">
import { OnlinePanel } from '/src/ui/OnlinePanel.ts';
const params = new URLSearchParams(location.search);
const identity = { name: params.get('name') || 'Alex', look: { hair: params.get('hair') || 'bob' } };
const players = new Map();
const qa = window.onlineQA = { identity, players, typing: false };
qa.panel = new OnlinePanel(document.querySelector('#app'), params.get('server'), {
  identity: () => identity,
  typing: (on) => { qa.typing = on; },
});
qa.panel.bind({
  reset: (roster) => { players.clear(); for (const p of roster) players.set(p.session, p); },
  upsert: (p) => players.set(p.session, p),
  presence: (session, presence) => { const p = players.get(session); if (p) p.presence = presence; },
  moved: (session, pose) => { const p = players.get(session); if (p) p.pose = pose; },
  remove: (session) => players.delete(session),
});
</script></body></html>`;

(async () => {
  const { createServer } = await import('vite');
  const { startServer } = await import('../server/index.ts');
  const rooms = await startServer({ port: 0, graceMs: 5000, log: () => {} });
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [{
      name: 'online-qa-fixture',
      configureServer(server) {
        server.middlewares.use('/__online-qa', (_req, res) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(fixture);
        });
      },
    }],
  });
  let browser;
  let failed = 0;
  try {
    await vite.listen();
    browser = await chromium.launch({ headless: true, channel: process.env.ONLINE_BROWSER || 'msedge' });
    const base = `http://127.0.0.1:${vite.httpServer.address().port}/__online-qa`;
    const url = (name, hair = 'bob') => `${base}?${new URLSearchParams({ name, hair, server: `ws://127.0.0.1:${rooms.port}` })}`;
    const run = async (name, test) => {
      const contexts = [];
      const errors = [];
      const page = async (who) => {
        const ctx = await browser.newContext();
        contexts.push(ctx);
        const p = await ctx.newPage();
        p.setDefaultTimeout(3000);
        p.on('pageerror', (e) => errors.push(e.message));
        p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        p.on('requestfailed', (req) => errors.push(`${req.url()}: ${req.failure()?.errorText}`));
        await p.goto(url(who));
        await p.waitForFunction(() => window.onlineQA);
        await p.locator('.online-button').click();
        return p;
      };
      const pair = async () => {
        const a = await page('Alex');
        await a.getByRole('button', { name: 'Crear sala privada', exact: true }).click();
        await a.locator('.online__code b').waitFor();
        const code = await a.locator('.online__code b').textContent();
        const b = await page('Marta');
        await b.locator('input[name="code"]').fill(code);
        await b.getByRole('button', { name: 'Entrar', exact: true }).click();
        await b.locator('input[name="chat"]').waitFor();
        await a.waitForFunction(() => document.querySelectorAll('.online__person').length === 2);
        return { a, b };
      };
      try {
        await test({ page, pair });
        assert.deepEqual(errors, [], 'errores del navegador');
        console.log(`PASS ${name}`);
      } catch (error) {
        failed++;
        console.error(`FAIL ${name}: ${error.message}`);
        if (errors.length) console.error(errors.join('\n'));
      } finally {
        for (const ctx of contexts) await ctx.close();
      }
    };
    const send = async (page, text) => {
      await page.locator('input[name="chat"]').fill(text);
      await page.locator('input[name="chat"]').press('Enter');
    };
    const incoming = async (a, b) => {
      await a.locator('input[name="chat"]').fill('borrador de Alex');
      await send(b, 'actividad de Marta');
      await a.waitForFunction(() => document.querySelector('.online__chat').textContent.includes('actividad de Marta'));
    };
    const clickHeld = async (page, button, duringPress = async () => {}) => {
      const handle = await button.elementHandle();
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      try {
        assert.ok(await handle.evaluate((el) => el.isConnected), 'focusout retiró el botón antes del clic');
        await duringPress();
        // A timer-based repaint on blur would still break a held pointer.
        await page.waitForTimeout(75);
        assert.ok(await handle.evaluate((el) => el.isConnected), 'actividad durante la pulsación retiró el botón');
      } finally {
        await page.mouse.up();
      }
    };

    await run('código inválido permite corregir y volver a entrar', async ({ page }) => {
      const a = await page('Alex');
      for (const code of ['ABC', 'IIIIII', '---']) {
        await a.locator('input[name="code"]').fill(code);
        await a.getByRole('button', { name: 'Entrar', exact: true }).click();
        await a.waitForFunction(() => document.querySelector('.online__state').textContent === 'Sin conexión');
        assert.ok(await a.locator('input[name="code"]').isVisible());
        assert.ok(await a.locator('.online__detail').textContent());
      }
      // Also recover from a server rejection of the handshake, rather than remaining in joining.
      await a.evaluate(() => { window.onlineQA.identity.name = ''; });
      await a.getByRole('button', { name: 'Crear sala privada', exact: true }).click();
      await a.waitForFunction(() => document.querySelector('.online__state').textContent === 'Sin conexión');
      await a.evaluate(() => { window.onlineQA.identity.name = 'Alex'; });
      await a.getByRole('button', { name: 'Crear sala privada', exact: true }).click();
      await a.locator('.online__code b').waitFor();
      const code = await a.locator('.online__code b').textContent();
      const b = await page('Marta');
      await b.locator('input[name="code"]').fill(`${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()}`);
      await b.getByRole('button', { name: 'Entrar', exact: true }).click();
      await b.locator('input[name="chat"]').waitFor();
    });
    await run('Enviar sobrevive al cambio de foco y a otra llegada durante la pulsación', async ({ pair }) => {
      const { a, b } = await pair();
      await incoming(a, b);
      await clickHeld(a, a.getByRole('button', { name: 'Enviar', exact: true }), async () => {
        // A remote sender must not steal the browser's pointer/focus during Alex's held click.
        await b.evaluate(() => {
          const field = document.querySelector('input[name="chat"]');
          field.value = 'segunda actividad';
          field.form.requestSubmit();
        });
        await a.waitForFunction(() => document.querySelector('.online__chat').textContent.includes('segunda actividad'));
      });
      await b.waitForFunction(() => document.querySelector('.online__chat').textContent.includes('borrador de Alex'));
      assert.equal(await a.locator('input[name="chat"]').inputValue(), '');
      assert.equal(await a.evaluate(() => window.onlineQA.typing), false);
    });
    await run('Bloquear se activa al primer clic después de recibir chat', async ({ pair }) => {
      const { a, b } = await pair();
      await incoming(a, b);
      await clickHeld(a, a.getByRole('button', { name: 'Bloquear', exact: true }));
      await a.getByRole('button', { name: 'Desbloquear', exact: true }).waitFor();
      assert.equal(await a.locator('input[name="chat"]').inputValue(), 'borrador de Alex');
      assert.ok(!(await a.locator('.online__chat').textContent()).includes('actividad de Marta'));
    });
    await run('Salir se activa al primer clic después de recibir chat', async ({ pair }) => {
      const { a, b } = await pair();
      await incoming(a, b);
      await clickHeld(a, a.getByRole('button', { name: 'Salir de la sala', exact: true }));
      await a.locator('input[name="code"]').waitFor();
      await b.locator('#outside').click();
      await b.waitForFunction(() => document.querySelectorAll('.online__person').length === 1);
    });
    await run('Tab conserva el foco en Enviar y Enter envía; salir del panel libera el teclado', async ({ pair }) => {
      const { a, b } = await pair();
      await incoming(a, b);
      await a.locator('input[name="chat"]').press('Tab');
      assert.equal(await a.evaluate(() => document.activeElement.textContent), 'Enviar');
      await a.keyboard.press('Enter');
      await b.waitForFunction(() => document.querySelector('.online__chat').textContent.includes('borrador de Alex'));
      await a.locator('input[name="chat"]').fill('otro borrador');
      await send(b, 'otra actividad');
      await a.waitForFunction(() => document.querySelector('.online__chat').textContent.includes('otra actividad'));
      await a.locator('#outside').click();
      assert.equal(await a.evaluate(() => window.onlineQA.typing), false);
      assert.equal(await a.locator('input[name="chat"]').inputValue(), 'otro borrador');
    });
    await run('recargar actualiza nombre y aspecto de la misma sesión sin anunciar otra entrada', async ({ pair }) => {
      const { a, b } = await pair();
      const session = await a.evaluate(() => [...window.onlineQA.players.values()].find((p) => p.name === 'Marta').session);
      await b.goto(url('Marta nueva', 'ponytail'));
      await b.locator('.online-button').click();
      await b.locator('input[name="chat"]').waitFor();
      await a.waitForFunction(() => document.querySelector('.online__people').textContent.includes('Marta nueva'));
      const player = await a.evaluate((id) => window.onlineQA.players.get(id), session);
      assert.equal(player.name, 'Marta nueva');
      assert.deepEqual(player.look, { hair: 'ponytail' });
      assert.equal(player.presence, 'connected');
      assert.equal(await a.locator('.online__person').count(), 2, 'la reconexión creó un clon');
      assert.ok(!(await a.locator('.online__chat').textContent()).includes('Marta nueva ha entrado.'), 'la actualización se anuncia como una entrada nueva');
    });
  } finally {
    if (browser) await browser.close();
    await vite.close();
    await rooms.close();
  }
  if (failed) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
