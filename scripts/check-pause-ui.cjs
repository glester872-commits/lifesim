// npm i --no-save playwright, or set PLAYWRIGHT_MODULE to an installed copy.
// Real browser focus and keyboard defaults against the production PauseMenu.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = `<!doctype html><html lang="es"><head>
<link rel="icon" href="data:,"><link rel="stylesheet" href="/src/style.css">
</head><body>
<div id="game"><button id="canvas-control">Juego</button></div>
<div id="overlay"><button id="map-button">Mapa</button><button id="phone-button">Móvil</button><button id="pause-button">Menú</button></div>
<div id="already-inert" inert><button>Ya desactivado</button></div>
<div id="pause" class="title title--pause" hidden></div>
<script type="module">
import { PauseMenu } from '/src/ui/PauseMenu.ts';
const qa = window.pauseQA = { paused: false, resumes: 0, saves: 0, backgroundClicks: 0, saveOK: true, leakedKeys: 0 };
qa.menu = new PauseMenu(document.querySelector('#pause'), document.querySelector('#pause-button'), {
  pause: () => { qa.paused = true; },
  resume: () => { qa.paused = false; qa.resumes++; },
  save: () => { qa.saves++; return qa.saveOK; },
  name: () => 'Alex',
});
for (const id of ['map-button', 'phone-button']) document.getElementById(id).onclick = () => qa.backgroundClicks++;
document.addEventListener('keydown', () => qa.leakedKeys++);
</script></body></html>`;

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [{ name: 'pause-qa-fixture', configureServer(server) {
      server.middlewares.use('/__pause-qa', (_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(fixture);
      });
    } }],
  });
  let browser;
  let failed = 0;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true, channel: process.env.PAUSE_BROWSER || 'msedge' });
    const url = `http://127.0.0.1:${server.httpServer.address().port}/__pause-qa`;
    const run = async (name, test) => {
      const page = await browser.newPage();
      page.setDefaultTimeout(3000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(url);
        await page.waitForFunction(() => window.pauseQA);
        await test(page);
        assert.deepEqual(errors, [], 'errores del navegador');
        console.log(`PASS ${name}`);
      } catch (error) {
        failed++;
        console.error(`FAIL ${name}: ${error.message}`);
      } finally {
        await page.close();
      }
    };
    const focusedAction = (page) => page.evaluate(() => document.activeElement?.dataset.action);

    await run('Tab y Mayús+Tab permanecen en la pausa', async (page) => {
      await page.locator('#pause-button').click();
      assert.equal(await focusedAction(page), 'resume');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await focusedAction(page), 'quit', 'Mayús+Tab escapó del diálogo');
      await page.keyboard.press('Tab');
      assert.equal(await focusedAction(page), 'resume', 'Tab escapó del diálogo');
      for (const action of ['save', 'quit', 'resume']) {
        await page.keyboard.press('Tab');
        assert.equal(await focusedAction(page), action);
      }
      for (const action of ['quit', 'save', 'resume']) {
        await page.keyboard.press('Shift+Tab');
        assert.equal(await focusedAction(page), action);
      }
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.pauseQA.paused), false);
    });

    await run('el fondo no puede recibir foco ni activarse durante la pausa', async (page) => {
      await page.locator('#pause-button').click();
      assert.equal(await page.locator('#game').evaluate((el) => el.inert), true);
      assert.equal(await page.locator('#overlay').evaluate((el) => el.inert), true);
      for (const id of ['map-button', 'phone-button', 'canvas-control']) {
        await page.locator(`#${id}`).evaluate((el) => el.focus());
        assert.equal(await focusedAction(page), 'resume', `${id} recibió el foco`);
      }
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.pauseQA.backgroundClicks), 0);
      assert.equal(await page.evaluate(() => window.pauseQA.paused), false);
    });

    await run('Esc restaura el foco y el estado previo del fondo en aperturas repetidas', async (page) => {
      for (let i = 0; i < 2; i++) {
        await page.locator('#pause-button').focus();
        await page.keyboard.press('Enter');
        assert.equal(await focusedAction(page), 'resume');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'pause-button');
        assert.equal(await page.locator('#pause').isHidden(), true);
        assert.equal(await page.locator('#game').evaluate((el) => el.inert), false);
        assert.equal(await page.locator('#overlay').evaluate((el) => el.inert), false);
        assert.equal(await page.locator('#already-inert').evaluate((el) => el.inert), true);
      }
      assert.equal(await page.evaluate(() => window.pauseQA.resumes), 2);
      await page.locator('#map-button').click();
      assert.equal(await page.evaluate(() => window.pauseQA.backgroundClicks), 1);
    });

    await run('guardar y el aviso de error conservan el foco; flechas y teclas no se filtran', async (page) => {
      await page.locator('#pause-button').click();
      await page.keyboard.press('ArrowUp');
      assert.equal(await focusedAction(page), 'quit');
      await page.keyboard.press('ArrowDown');
      assert.equal(await focusedAction(page), 'resume');
      await page.locator('[data-action="save"]').click();
      assert.equal(await focusedAction(page), 'save');
      assert.match(await page.locator('[role="status"]').textContent(), /Partida guardada/);
      await page.evaluate(() => { window.pauseQA.saveOK = false; });
      await page.locator('[data-action="quit"]').click();
      assert.equal(await focusedAction(page), 'quit');
      assert.match(await page.locator('[role="status"]').textContent(), /No se ha podido guardar/);
      await page.keyboard.press('Tab');
      assert.equal(await focusedAction(page), 'resume');
      for (const key of ['p', 'm', 'e', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => window.pauseQA.leakedKeys), 0);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.pauseQA.leakedKeys), 0);
    });

    await run('la apertura desde el juego también devuelve el foco original', async (page) => {
      await page.locator('#canvas-control').focus();
      await page.evaluate(() => { window.pauseQA.menu.show(); window.pauseQA.menu.show(); });
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'canvas-control');
      assert.equal(await page.evaluate(() => window.pauseQA.resumes), 1);
    });
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
  if (failed) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
