// Run from either release-line checkout:
// PLAYWRIGHT_MODULE=/scratch/node_modules/playwright-core \
// LEAFLET_DIST=/scratch/node_modules/leaflet/dist node tests/popup.cjs
// Optional BROWSER=firefox|webkit (defaults to system Chrome).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
assert.ok(process.env.LEAFLET_DIST, 'Set LEAFLET_DIST to the matching Leaflet dist directory');
const dist = path.resolve(process.env.LEAFLET_DIST);
const classic = JSON.parse(fs.readFileSync(path.join(dist, '../package.json'))).version.startsWith('1.');
const root = process.cwd();
const cases = [
  ['Trailhead', 'Water & shade nearby'],
  ['<img src="data:image/png;base64,invalid" onerror="window.__popupExecuted=true">', '<svg onload="window.__popupExecuted=true"></svg>'],
  ['</b><script>window.__popupExecuted=true</script><b>', '<a href="javascript:window.__popupExecuted=true">Click</a>'],
  ['&lt;img src=x&gt;', 'Café & "coffee" and \'shade\''],
];
const imports = classic ?
  '<script src="/leaflet.js"></script><script src="/gpx.js"></script>' :
  '<script type="importmap">{"imports":{"leaflet":"/leaflet.js","leaflet-gpx":"/gpx.js"}}</script>';
const html = `<!doctype html><link rel="stylesheet" href="/leaflet.css"><style>#map{width:600px;height:400px}</style><div id="map"></div>${imports}
<script type="module">
${classic ? 'const GPX = L.GPX; const createMap = (id, options) => L.map(id, options);' : "import { Map } from 'leaflet'; import { GPX } from 'leaflet-gpx'; const createMap = (id, options) => new Map(id, options);"}
const map = createMap('map', {center:[0,0], zoom:5, zoomAnimation:false, fadeAnimation:false});
window.checkPopups = async cases => {
  const results = [];
  for (const [name, desc] of cases) {
    const xml = '<gpx><wpt lat="0" lon="0"><name><![CDATA[' + name + ']]></name><desc><![CDATA[' + desc + ']]></desc></wpt></gpx>';
    const layer = new GPX(xml, {async:true});
    const event = await new Promise(resolve => layer.on('loaded error', resolve));
    if (event.type !== 'loaded') throw new Error(event.err);
    layer.addTo(map);
    const [marker] = layer.getLayers();
    marker.openPopup();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const content = marker.getPopup().getElement().querySelector('.leaflet-popup-content');
    results.push({text:content.textContent, bold:content.querySelector('b').textContent,
      elements:Array.from(content.querySelectorAll('*'), element => element.tagName)});
    layer.remove();
  }
  return results;
};
</script>`;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
  const file = pathname === '/leaflet.js' ? path.join(dist, 'leaflet.js') :
    pathname === '/leaflet.css' ? path.join(dist, 'leaflet.css') :
    pathname === '/gpx.js' ? path.join(root, 'gpx.js') :
    pathname.startsWith('/images/') ? path.join(dist, 'images', path.basename(pathname)) : null;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/javascript');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.BROWSER || 'chromium';
  const browser = await playwright[engine].launch(engine === 'chromium' ? {channel:'chrome'} : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.waitForFunction(() => window.checkPopups);
    const results = await page.evaluate(cases => window.checkPopups(cases), cases);
    results.forEach((result, i) => {
      assert.equal(result.text, cases[i][0] + cases[i][1]);
      assert.equal(result.bold, cases[i][0]);
      assert.deepEqual(result.elements, ['B', 'BR']);
    });
    assert.equal(await page.evaluate(() => window.__popupExecuted), undefined);
    assert.deepEqual(errors, []);
    console.log(`Popup escaping passed in ${engine} with Leaflet ${classic ? '1' : '2'}.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
