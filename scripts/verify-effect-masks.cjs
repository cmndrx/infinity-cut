// Run against an explicitly started local Vite server. No user project is opened or modified.
const {openBrowser} = require('@remotion/renderer');
const {execFileSync} = require('node:child_process');
async function main() {
  const browser = await openBrowser('chrome', {browserExecutable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', logLevel: 'error'});
  try {
    const page = await browser.newPage({context: () => null, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => {}});
    await page.setViewport({width: 320, height: 180, deviceScaleFactor: 1});
    await page.goto({url: 'http://127.0.0.1:4175/editor.html', timeout: 30000});
    const capture = async (target, enabled) => {
      await page.evaluate(async (target, enabled) => {
        const {showMaskFixture} = await import('/scripts/effect-mask-fixture.tsx');
        showMaskFixture(target, enabled);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await Promise.all(Array.from(document.images).map((img) => img.decode()));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, target, enabled);
      const result = await page._client().send('Page.captureScreenshot', {format: 'png'});
      return execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], {input: Buffer.from(result.value.data, 'base64')});
    };
    for (const target of ['blur', 'vignette', 'grain', 'glow']) {
      const before = await capture(target, false), after = await capture(target, true);
      let inside = 0, outside = 0;
      for (let y = 5; y < 175; y++) for (let x = 5; x < 315; x++) {
        for (let c = 0; c < 3; c++) {
          const i = (y * 320 + x) * 3 + c;
          const delta = Math.abs(before[i] - after[i]);
          if (x < 150) inside += delta;
          if (x > 170) outside += delta;
        }
      }
      console.log(JSON.stringify({target, insidePixelDifference: inside, outsidePixelDifference: outside}));
      if (!inside || outside) throw new Error(`${target}: mask did not isolate the intended region`);
    }
  } finally { await browser.close({silent: true}); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
