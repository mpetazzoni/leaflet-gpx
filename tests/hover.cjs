// Run from a docs or gh-pages checkout. Install playwright-core and the matching
// pinned Leaflet release in scratch space; no repository dependency changes:
// PLAYWRIGHT_MODULE=/scratch/node_modules/playwright-core \
// LEAFLET_DIST=/scratch/node_modules/leaflet/dist node tests/hover.cjs
// Optional: CHROME_EXECUTABLE=/path/to/chrome SCREENSHOT_DIR=/scratch/screenshots
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

const root = process.cwd();
assert.ok(process.env.LEAFLET_DIST, 'Set LEAFLET_DIST to a pinned local Leaflet dist directory');
const dist = path.resolve(process.env.LEAFLET_DIST);
const version = JSON.parse(fs.readFileSync(path.join(dist, '../package.json'))).version;
assert.ok(['1.9.4', '2.0.0-beta.4'].includes(version), 'Use a tested, pinned Leaflet version');
const classic = version === '1.9.4';
const docs = fs.existsSync(path.join(root, 'README.md'));
const fixture = `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:t="urn:test"><trk><name>Hover fixture</name><trkseg>
<trkpt lat="38" lon="-122"><ele>10</ele><time>2026-01-01T12:00:00Z</time></trkpt>
<trkpt lat="38.001" lon="-122.005"><ele>-5</ele><time>2026-01-01T12:00:10Z</time><speed>2</speed><extensions><t:hr>140</t:hr><t:cad>80</t:cad><t:atemp>-2</t:atemp></extensions></trkpt>
<trkpt lat="38.003" lon="-122.008"><ele>NaN</ele><speed>NaN</speed></trkpt>
<trkpt lat="38.006" lon="-122.01"><ele>0</ele><time>invalid</time><speed>0</speed><extensions><t:hr>NaN</t:hr><t:cad>0</t:cad><t:atemp>0</t:atemp></extensions></trkpt>
<trkpt lat="38.009" lon="-122.012"><ele>10</ele><time>2026-01-01T12:01:00Z</time></trkpt>
</trkseg></trk></gpx>`;

const leafletURL = `https://unpkg.com/leaflet@${version}/dist/leaflet.js`;
let html;
if (docs) {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const section = readme.split('## Hovering over track points')[1].split('## Line styling')[0];
  const code = section.match(/```javascript\n([\s\S]*?)```/)[1];
  assert.equal(code.includes("line.on('mousemove'"), classic, 'README event names must match Leaflet');
  html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="https://unpkg.com/leaflet@${version}/dist/leaflet.css"><style>body{margin:0}#map{height:600px}</style><div id="map"></div>`;
  html += classic ? `<script src="${leafletURL}"></script><script src="/gpx.js"></script>` :
    `<script type="importmap">{"imports":{"leaflet":"${leafletURL}","leaflet-gpx":"/gpx.js"}}</script>`;
  html += `<script type="module">${code}\nwindow.__addPointHover = addPointHover;</script>`;
}

// Capture actual addline/loaded events without test globals in production code.
const capture = `
const originalFire = ${classic ? 'L.GPX' : 'GPX'}.prototype.fire;
${classic ? 'L.GPX' : 'GPX'}.prototype.fire = function(type, data, ...args) {
  window.__hoverTest ||= { lines: [] };
  if (type === 'addline') window.__hoverTest.lines.push(data.line);
  const result = originalFire.call(this, type, data, ...args);
  if (type === 'loaded') {
    window.__hoverTest.map = this._map;
    window.__hoverTest.gpx = this;
  }
  return result;
};`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gpx': 'application/xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  if (docs && name === '/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(html);
  }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end();
  }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  if (name === '/gpx.js') return res.end(fs.readFileSync(file, 'utf8') + capture);
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.CHROME_EXECUTABLE ?
    { executablePath: process.env.CHROME_EXECUTABLE } : { channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, timezoneId: 'America/Los_Angeles' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Serve exact pinned CDN resources locally for deterministic/offline runs.
    await page.route('https://unpkg.com/leaflet@*/dist/**', route => {
      const relative = new URL(route.request().url()).pathname.split('/dist/')[1];
      const file = path.join(dist, relative);
      return route.fulfill({ path: file, contentType: mime[path.extname(file)] });
    });
    const blankTile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef2f4"/></svg>';
    await page.route(/https:\/\/[^/]*tile\.openstreetmap\.(org|fr)\/.*/, route => route.fulfill({ body: blankTile, contentType: 'image/svg+xml' }));
    if (docs) await page.route('https://mpetazzoni.github.io/leaflet-gpx/demo.gpx', route => route.fulfill({ body: fixture, contentType: 'application/xml' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__hoverTest?.map && window.__hoverTest.lines.length);
    assert.deepEqual(errors, []);

    const metadata = await page.evaluate(async ({ classic, leafletURL }) => {
      const { lines, map } = window.__hoverTest;
      const line = lines[0], points = line.getLatLngs();
      const Polyline = classic ? L.Polyline : (await import(leafletURL)).Polyline;
      const p = points[1];
      const preserved = new Polyline([p]).getLatLngs()[0] === p;
      map.options.fadeAnimation = false;
      map.options.zoomAnimation = false;
      window.__hoverTest.sample = p;
      return { preserved, keys: Object.keys(p.meta), count: points.length };
    }, { classic, leafletURL });
    assert.ok(metadata.preserved, 'Polyline preserves LatLng identity and meta');
    assert.deepEqual(metadata.keys.sort(), ['atemp', 'cad', 'ele', 'hr', 'speed', 'time']);

    async function hover(index = 1) {
      await page.locator('.leaflet-container').scrollIntoViewIfNeeded();
      await page.mouse.move(1, 1);
      const position = await page.evaluate(index => {
        const { map, lines } = window.__hoverTest;
        const sample = lines[0].getLatLngs()[index];
        // Put the sample well inside the viewport, avoiding clipping/markers.
        map.panTo(sample, { animate: false });
        const p = map.latLngToContainerPoint(sample);
        const rect = map.getContainer().getBoundingClientRect();
        // Exclude this test helper's own pan/projection calls from cache counts.
        window.__hoverTest.projections = 0;
        return { x: rect.left + p.x, y: rect.top + p.y };
      }, index);
      await page.mouse.move(position.x, position.y);
      await page.waitForFunction(() => document.querySelector('.leaflet-tooltip')?.textContent.length > 0);
      return page.locator('.leaflet-tooltip').innerText();
    }
    async function exit() {
      await page.mouse.move(1, 1);
      await page.waitForFunction(() => !document.querySelector('.leaflet-tooltip'));
    }
    const text = await hover(docs ? 1 : 1000);
    for (const field of ['Time:', 'Elevation:', 'Speed:', 'Heart rate:', 'Cadence:']) assert.ok(text.includes(field), text);
    if (docs) {
      for (const value of ['2026-01-01T12:00:10.000Z', '-5.0 m', '7.2 km/h', '140 bpm', '80 rpm', '-2 °C']) assert.ok(text.includes(value), text);
    } else assert.ok(!text.includes('Ambient temperature:'), 'Demo has no temperature sensor data');
    const shots = process.env.SCREENSHOT_DIR;
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `${docs ? 'docs' : 'demo'}-${version}-hover.png`) });
    }
    await exit();

    await page.evaluate(() => {
      const { map, lines } = window.__hoverTest;
      const points = new Set(lines[0].getLatLngs());
      const project = map.project;
      window.__hoverTest.projections = 0;
      map.project = function(point, ...args) {
        if (points.has(point)) window.__hoverTest.projections++;
        return project.call(this, point, ...args);
      };
    });
    await hover(docs ? 1 : 1000); // Same zoom and pan: no projection pass.
    assert.equal(await page.evaluate(() => window.__hoverTest.projections), 0);
    await exit();
    await page.evaluate(() => {
      const { map } = window.__hoverTest;
      map.setZoom(map.getZoom() + 1, { animate: false });
    });
    assert.ok((await hover(docs ? 1 : 1000)).includes('Heart rate:'));
    await exit();

    if (docs) {
      const missing = await hover(2);
      assert.equal(missing, 'Point: No recorded data', 'Synthetic epoch, nulls and NaN are omitted');
      await exit();
      const zero = await hover(3);
      assert.ok(zero.includes('Elevation: 0.0 m') && zero.includes('Speed: 0.0 km/h') && zero.includes('Cadence: 0 rpm') && zero.includes('Ambient temperature: 0 °C'), zero);
      assert.ok(!zero.includes('Time:') && !zero.includes('Heart rate:'), zero);
      await exit();
    } else {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.evaluate(() => window.__hoverTest.map.invalidateSize({ animate: false }));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile horizontal overflow');
      await hover(1000);
      assert.ok(await page.locator('.leaflet-tooltip').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      }), 'Mobile tooltip fits the viewport');
      if (shots) await page.screenshot({ path: path.join(shots, 'demo-mobile-hover.png') });
      await exit();
    }
    // Cancel a scheduled render by removing GPX synchronously, before its RAF.
    assert.ok(await page.evaluate(async classic => {
      const { map, gpx, lines } = window.__hoverTest;
      lines[0].fire(classic ? 'mousemove' : 'pointermove', {
        latlng: lines[0].getLatLngs()[1]
      });
      map.removeLayer(gpx);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return !document.querySelector('.leaflet-tooltip');
    }, classic), 'Removing GPX before RAF must not resurrect the tooltip');
    assert.deepEqual(errors, [], 'No pageerror from cancelled render');
    await page.evaluate(() => window.__hoverTest.gpx.addTo(window.__hoverTest.map));
    // Keep the separate rendered-tooltip removal and re-add regression test.
    await hover(docs ? 1 : 1000);
    await page.evaluate(() => {
      const { map, gpx } = window.__hoverTest;
      map.removeLayer(gpx);
    });
    await page.waitForFunction(() => !document.querySelector('.leaflet-tooltip'));
    await page.evaluate(() => window.__hoverTest.gpx.addTo(window.__hoverTest.map));
    await hover(docs ? 1 : 1000);
    await exit();
    // A high-latitude counterexample: degree-distance chooses A; screen-pixel
    // distance chooses B. Exercise the actual helper, not a duplicate algorithm.
    const projected = await page.evaluate(async ({ classic, leafletURL, docs }) => {
      const lib = classic ? L : await import(leafletURL);
      const helper = docs ? window.__addPointHover : (await import('/point-hover.js')).addPointHover;
      const { map, gpx } = window.__hoverTest;
      map.removeLayer(gpx);
      map.setView([70, 0], 5, { animate: false });
      const a = new lib.LatLng(70.5, 0), b = new lib.LatLng(70, 1);
      a.meta = { hr: 100 };
      b.meta = { hr: 200, ele: '<img src=x onerror=alert(1)>', speed: -1, cad: -1, atemp: NaN, time: new Date(NaN) };
      const line = new lib.Polyline([a, b]);
      helper(map, line);
      line.addTo(map);
      window.__hoverTest.extra = line;
      line.fire(classic ? 'mousemove' : 'pointermove', { latlng: new lib.LatLng(70, 0) });
      return Math.hypot(a.lat - 70, a.lng) < Math.hypot(b.lat - 70, b.lng);
    }, { classic, leafletURL, docs });
    assert.ok(projected, 'Degree distance would select sample A');
    await page.waitForFunction(() => document.querySelector('.leaflet-tooltip')?.textContent === 'Heart rate: 200 bpm');
    assert.equal(await page.locator('.leaflet-tooltip img').count(), 0, 'Invalid/untrusted metadata is never HTML');
    await page.evaluate(() => window.__hoverTest.extra.remove());
    await page.waitForFunction(() => !document.querySelector('.leaflet-tooltip'));

    // Place rich samples at actual map edges. Do NOT use hover(), panTo() or
    // recenter the sample: moving the real pointer exercises edge placement.
    // Hide controls only in this test so corner samples aren't covered by them.
    await page.locator('.leaflet-control-container').evaluate(element => { element.style.visibility = 'hidden'; });
    await page.evaluate(() => { document.body.style.paddingBottom = '800px'; });
    for (const [width, cropped] of [[375, false], [375, true], [220, false], [220, true]]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => window.__hoverTest.map.invalidateSize({ animate: false }));
      await page.locator('.leaflet-container').scrollIntoViewIfNeeded();
      if (cropped) await page.evaluate(() => {
        const rect = window.__hoverTest.map.getContainer().getBoundingClientRect();
        window.scrollTo(0, window.scrollY + rect.top + 60);
      });
      for (const edge of ['left', 'right', 'top', 'bottom', 'top-left', 'top-right']) {
        const position = await page.evaluate(async ({ classic, leafletURL, docs, edge }) => {
          const lib = classic ? L : await import(leafletURL);
          const helper = docs ? window.__addPointHover : (await import('/point-hover.js')).addPointHover;
          const { map } = window.__hoverTest;
          const size = map.getSize();
          const rect = map.getContainer().getBoundingClientRect();
          const x = edge.includes('left') ? 12 : edge.includes('right') ? size.x - 12 : size.x / 2;
          const visibleTop = Math.max(0, -rect.top), visibleBottom = Math.min(size.y, innerHeight - rect.top);
          const y = edge.includes('top') ? visibleTop + 12 : edge === 'bottom' ? visibleBottom - 12 : (visibleTop + visibleBottom) / 2;
          const sample = map.containerPointToLatLng([x, y]);
          sample.meta = { time: new Date('2026-01-01T12:00:10Z'), ele: -5, speed: 2, hr: 140, cad: 80, atemp: -2 };
          const next = map.containerPointToLatLng([x < size.x / 2 ? x + 8 : x - 8, y < size.y / 2 ? y + 8 : y - 8]);
          const line = new lib.Polyline([sample, next], { weight: 10 });
          helper(map, line);
          line.addTo(map);
          window.__hoverTest.edgeLine = line;
          return { x: rect.left + x + map.getContainer().clientLeft, y: rect.top + y + map.getContainer().clientTop };
        }, { classic, leafletURL, docs, edge });
        await page.mouse.move(position.x, position.y);
        await page.waitForFunction(() => document.querySelector('.leaflet-tooltip')?.textContent.includes('Ambient temperature: -2 °C'));
        const fits = await page.locator('.leaflet-tooltip').evaluate(element => {
          const box = element.getBoundingClientRect();
          const map = window.__hoverTest.map.getContainer().getBoundingClientRect();
          return box.left >= Math.max(0, map.left) && box.right <= Math.min(innerWidth, map.right) &&
            box.top >= Math.max(0, map.top) && box.bottom <= Math.min(innerHeight, map.bottom);
        });
        assert.ok(fits, `${version}: ${width}px ${edge} cropped=${cropped} tooltip must fit map AND viewport`);
        if (shots && edge === 'top-left') await page.screenshot({ path: path.join(shots, `${docs ? 'docs' : 'demo'}-${version}-${width}-${cropped ? 'cropped-' : ''}edge-hover.png`) });
        await page.evaluate(() => window.__hoverTest.edgeLine.remove());
        await page.waitForFunction(() => !document.querySelector('.leaflet-tooltip'));
        await page.mouse.move(1, 1);
      }
    }
    assert.deepEqual(errors, [], 'No browser pageerrors');
    console.log(JSON.stringify({ mode: docs ? 'README example' : 'live demo', version, metadata, hover: text, pageerrors: errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
