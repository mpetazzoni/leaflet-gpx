// Offline browser regression test for the gh-pages viewer. Run from its root:
// PLAYWRIGHT_MODULE=/scratch/node_modules/playwright-core \
// LEAFLET_DIST=/scratch/node_modules/leaflet/dist node tests/demo-loader.cjs
// Optional BROWSER=firefox|webkit, or CHROME_EXECUTABLE=/path/to/chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = process.cwd();
assert.ok(process.env.LEAFLET_DIST, 'Set LEAFLET_DIST to Leaflet 2.0.0-beta.4 dist');
const dist = path.resolve(process.env.LEAFLET_DIST);
assert.equal(JSON.parse(fs.readFileSync(path.join(dist, '../package.json'))).version, '2.0.0-beta.4');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gpx': 'application/xml' };
const capture = `
const originalFire = GPX.prototype.fire;
GPX.prototype.fire = function(type, data, ...args) {
  window.__loaderTest ||= { records: [] };
  let record = window.__loaderTest.records.find(record => record.gpx === this);
  if (!record) window.__loaderTest.records.push(record = { gpx: this, lines: [], points: [] });
  if (type === 'addline') record.lines.push(data.line);
  if (type === 'addpoint') record.points.push(data.point);
  const result = originalFire.call(this, type, data, ...args);
  if (type === 'loaded') { record.loaded = true; record.map = this._map; }
  return result;
};`;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end();
  }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  if (pathname === '/gpx.js') return res.end(fs.readFileSync(file, 'utf8') + capture);
  fs.createReadStream(file).pipe(res);
});
const wrap = contents => `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:t="urn:test">${contents}</gpx>`;
const rich = name => wrap(`<trk><name>${name}</name><trkseg>
<trkpt lat="38" lon="-122"><ele>10</ele><time>2026-01-01T12:00:00Z</time></trkpt>
<trkpt lat="38.001" lon="-122.005"><ele>12</ele><time>2026-01-01T12:00:10Z</time><extensions><t:hr>140</t:hr><t:cad>80</t:cad><t:atemp>-2</t:atemp></extensions></trkpt>
<trkpt lat="38.003" lon="-122.008"><ele>15</ele><time>2026-01-01T12:00:20Z</time></trkpt>
</trkseg></trk>`);
const sparse = wrap('<rte><rtept lat="38" lon="-122"/><rtept lat="38.001" lon="-122.005"/><rtept lat="38.003" lon="-122.008"/></rte>');

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.BROWSER || 'chromium';
  assert.ok(['chromium', 'firefox', 'webkit'].includes(engine), 'Use BROWSER=chromium|firefox|webkit');
  const browser = await playwright[engine].launch(engine === 'chromium' ?
    (process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: 'chrome' }) : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, timezoneId: 'America/Los_Angeles' });
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.url().includes('sentinel.invalid')) unexpected.push(request.url());
    });
    await page.route('https://unpkg.com/leaflet@2.0.0-beta.4/dist/**', route => {
      const file = path.join(dist, new URL(route.request().url()).pathname.split('/dist/')[1]);
      return route.fulfill({ path: file, contentType: mime[path.extname(file)] });
    });
    await page.route(/https:\/\/[^/]*tile\.openstreetmap\.fr\/.*/, route => route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef2f4"/></svg>', contentType: 'image/svg+xml'
    }));
    // Controlled fetch responses model HTTP, browser CORS failures and even a
    // transport ignoring abort. No app test hooks and no real remote requests.
    await page.addInitScript(() => {
      const realFetch = window.fetch;
      window.__transport = { calls: [], pending: {}, replies: {} };
      window.fetch = function(url, options) {
        const parsed = new URL(url, document.baseURI), state = window.__transport;
        state.calls.push(parsed.href);
        if (parsed.hostname !== 'fixture.invalid') return realFetch.call(this, url, options);
        return new Promise((resolve, reject) => {
          const complete = reply => {
            if (reply.error) reject(new TypeError(reply.error));
            else resolve(new Response(reply.body, { status: reply.status || 200 }));
          };
          if (state.replies[parsed.pathname]) complete(state.replies[parsed.pathname]);
          else state.pending[parsed.pathname] = complete;
        });
      };
      const realText = File.prototype.text;
      window.__files = {};
      File.prototype.text = function() {
        if (this.name === 'pending.gpx') return new Promise(resolve => { window.__files.release = () => realText.call(this).then(resolve); });
        if (this.name === 'unreadable.gpx') return Promise.reject(new Error('Cannot read this file'));
        return realText.call(this);
      };
      const realObjectURL = URL.createObjectURL;
      window.__objectURLs = 0;
      URL.createObjectURL = function(...args) { window.__objectURLs++; return realObjectURL.apply(this, args); };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const status = page.locator('.status');
    async function loaded(name) {
      await page.waitForFunction(name => document.querySelector('.status').textContent.startsWith('Loaded ') && document.querySelector('h3').textContent === name, name);
    }
    async function file(name, body) {
      await page.locator('#gpx-file').setInputFiles({ name, mimeType: 'application/gpx+xml', buffer: Buffer.from(body) });
    }
    async function reply(urlPath, response) {
      await page.evaluate(({ urlPath, response }) => { window.__transport.replies[urlPath] = response; }, { urlPath, response });
    }
    async function url(value) {
      await page.locator('#gpx-url').fill(value);
      await page.getByRole('button', { name: 'Load URL', exact: true }).click();
    }
    async function error(includes) {
      await page.waitForFunction(includes => document.querySelector('.status').textContent.startsWith('Unable to load GPX:') && document.querySelector('.status').textContent.includes(includes), includes);
    }
    async function latestRecord() {
      return page.evaluate(() => window.__loaderTest.records.length - 1);
    }
    async function hover() {
      await page.locator('.map').scrollIntoViewIfNeeded();
      await page.mouse.move(1, 1);
      const position = await page.evaluate(() => {
        const record = window.__loaderTest.records.at(-1), map = record.map;
        map.options.zoomAnimation = map.options.fadeAnimation = false;
        const sample = record.lines[0].getLatLngs()[1];
        map.panTo(sample, { animate: false });
        const point = map.latLngToContainerPoint(sample), rect = map.getContainer().getBoundingClientRect();
        return { x: rect.left + point.x, y: rect.top + point.y };
      });
      await page.mouse.move(position.x, position.y);
      await page.waitForFunction(() => document.querySelector('.leaflet-tooltip')?.textContent);
      return (await page.locator('.leaflet-tooltip').innerText()).trim();
    }
    await page.waitForFunction(() => document.querySelector('.status').textContent.startsWith('Loaded '));
    assert.ok(await page.evaluate(() => {
      const map = document.querySelector('.map');
      const sources = document.querySelector('.sources');
      return sources.closest('footer') && sources.getBoundingClientRect().top >= map.getBoundingClientRect().bottom &&
        parseFloat(getComputedStyle(sources).fontSize) < parseFloat(getComputedStyle(document.body).fontSize);
    }), 'Compact loading controls belong below the map');
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'demo-controls-desktop.png'), fullPage: true });
    }
    const sampleName = await page.locator('h3').innerText();
    assert.ok(await page.locator('h3 a').count());
    const sample = await latestRecord();

    await file('local.gpx', rich('Local rich track'));
    await loaded('Local rich track');
    assert.ok((await status.innerText()).includes('stayed in your browser'));
    assert.equal(await page.locator('h3 a').count(), 0, 'No file upload/download object URL');
    assert.ok(await page.evaluate(index => !window.__loaderTest.records[index].gpx._map, sample));
    const text = await hover();
    for (const field of ['Time:', 'Elevation:', 'Speed:', 'Heart rate: 140 bpm', 'Cadence: 80 rpm', 'Ambient temperature: -2 °C']) assert.ok(text.includes(field), text);
    const old = await latestRecord();
    await reply('/rich', { body: rich('URL rich track') });
    await url('https://fixture.invalid/rich');
    await loaded('URL rich track');
    assert.equal(await page.locator('.leaflet-tooltip').count(), 0, 'Replacement closes hover');
    assert.ok(await page.evaluate(index => {
      const { gpx, lines, map } = window.__loaderTest.records[index];
      return !gpx._map && gpx.getLayers().length === 0 && lines.every(line => !map.hasLayer(line) && !line.listens('pointermove') && !line.listens('pointerout'));
    }, old), 'Old layers and hover listeners removed');
    assert.equal(await page.locator('.leaflet-control-layers-overlays label').count(), 1, 'Only current overlay in control');
    assert.equal(await page.locator('h3 a').getAttribute('href'), 'https://fixture.invalid/rich');
    assert.ok((await hover()).includes('Heart rate: 140 bpm'));

    await file('sparse.gpx', sparse);
    await loaded('sparse.gpx');
    assert.equal(await page.locator('.duration').innerText(), '—');
    assert.equal(await page.locator('.pace').innerText(), '—');
    assert.equal(await page.locator('.avghr').innerText(), '—');
    assert.equal(await page.locator('.elevation-gain').innerText(), '—');
    assert.ok((await page.locator('.start').innerText()).includes('—'));
    assert.ok(!Number.isNaN(Number(await page.locator('.distance').innerText())));
    assert.equal(await hover(), 'Point: No recorded data', 'No synthetic epoch, elevation or zero speed');

    await file('invalid-telemetry.gpx', wrap('<rte><rtept lat="38" lon="-122"><ele>NaN</ele><time>invalid</time></rtept><rtept lat="38.001" lon="-122.005"><ele>NaN</ele><time>invalid</time><speed>NaN</speed><extensions><t:hr>NaN</t:hr></extensions></rtept><rtept lat="38.003" lon="-122.008"/></rte>'));
    await loaded('invalid-telemetry.gpx');
    const invalidStats = await page.locator('.info').innerText();
    assert.ok(!/NaN|Infinity|Invalid Date|1970/.test(invalidStats), invalidStats);
    assert.equal(await hover(), 'Point: No recorded data');
    await file('numeric-junk.gpx', wrap('<trk><trkseg>' +
      '<trkpt lat="38" lon="-122"><ele>10</ele><time>2026-01-01T12:00:00Z</time></trkpt>' +
      '<trkpt lat="38.001" lon="-122.005"><ele>10</ele><time>2026-01-01T12:00:10Z</time>' +
      '<speed>12oops</speed><extensions><t:hr>140oops</t:hr><t:cad>80oops</t:cad><t:atemp>2oops</t:atemp></extensions></trkpt>' +
      '<trkpt lat="38.003" lon="-122.008"><ele>10</ele><time>2026-01-01T12:00:20Z</time></trkpt>' +
      '</trkseg></trk>'));
    await loaded('numeric-junk.gpx');
    assert.equal(await page.locator('.avghr').innerText(), '—');
    const junkHover = await hover();
    assert.ok(!/Heart rate:|Cadence:|Ambient temperature:/.test(junkHover), junkHover);
    const derivedSpeed = await page.evaluate(() => {
      const points = window.__loaderTest.records.at(-1).lines[0].getLatLngs();
      return { actual: points[1].meta.speed, expected: points[1].distanceTo(points[0]) / 10 };
    });
    assert.ok(Math.abs(derivedSpeed.actual - derivedSpeed.expected) < 1e-8,
      'Invalid explicit speed is recomputed, not permissively parsed');
    assert.ok(junkHover.includes('Speed: ' + (derivedSpeed.expected * 3.6).toFixed(1) + ' km/h'), junkHover);
    await file('zero-telemetry.gpx', wrap('<rte><rtept lat="38" lon="-122"><ele>0</ele><time>2026-01-01T12:00:00Z</time></rtept><rtept lat="38.001" lon="-122.005"><ele>0</ele><time>2026-01-01T12:00:10Z</time><speed>0</speed><extensions><t:hr>0</t:hr><t:cad>0</t:cad><t:atemp>0</t:atemp></extensions></rtept><rtept lat="38.003" lon="-122.008"><ele>0</ele><time>2026-01-01T12:00:20Z</time></rtept></rte>'));
    await loaded('zero-telemetry.gpx');
    assert.equal(await page.locator('.elevation-gain').innerText(), '0', 'Recorded zero remains available');
    assert.equal(await page.locator('.avghr').innerText(), '0');
    const zeroHover = await hover();
    for (const text of ['Elevation: 0.0 m', 'Speed: 0.0 km/h', 'Heart rate: 0 bpm', 'Cadence: 0 rpm', 'Ambient temperature: 0 °C']) assert.ok(zeroHover.includes(text), zeroHover);
    const partial = wrap('<trk><trkseg><trkpt lat="38" lon="-122"><ele>10</ele><time>2026-01-01T12:00:00Z</time></trkpt><trkpt lat="38.001" lon="-122.005"/><trkpt lat="38.003" lon="-122.008"/></trkseg></trk>');
    await file('partial.gpx', partial);
    await loaded('partial.gpx');
    assert.equal(await hover(), 'Point: No recorded data', 'Missing elevation is not inherited in viewer hover');
    assert.equal(await page.locator('.elevation-gain').innerText(), '—');
    assert.equal(await page.locator('.duration').innerText(), '—');

    const malicious = '&lt;img src="https://sentinel.invalid/pwn" onerror="window.__pwned=true"&gt;';
    await file('waypoints.gpx', wrap(`<metadata><name>${malicious}</name></metadata><wpt lat="38" lon="-122"><name>${malicious}</name><desc>${malicious}</desc></wpt>`));
    const literal = '<img src="https://sentinel.invalid/pwn" onerror="window.__pwned=true">';
    await loaded(literal);
    assert.equal(await page.locator('h3 img').count(), 0);
    assert.equal(await page.locator('.leaflet-control-layers-overlays img').count(), 0);
    assert.ok((await page.locator('.start').innerText()).includes('—'));
    for (const stat of ['distance', 'duration', 'pace', 'avghr', 'elevation-gain', 'elevation-loss', 'elevation-net']) assert.equal(await page.locator('.' + stat).innerText(), '—');
    await page.locator('.map').scrollIntoViewIfNeeded();
    await page.locator('.leaflet-marker-icon').click();
    await page.waitForFunction(() => document.querySelector('.leaflet-popup-content'));
    assert.equal((await page.locator('.leaflet-popup-content').innerText()).trim(), literal + '\n' + literal);
    assert.equal(await page.locator('.leaflet-popup-content img').count(), 0);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.deepEqual(unexpected, [], 'No malicious waypoint requests');

    const callsBefore = await page.evaluate(() => window.__transport.calls.length);
    for (const [name, contents] of [['invalid.gpx', 'not XML'], ['broken.gpx', '<gpx>'], ['wrong.gpx', '<html/>'], ['empty.gpx', wrap('')], ['bad-coordinates.gpx', wrap('<wpt lat="999" lon="0"/>')]]) {
      await file(name, contents);
      await error(name === 'empty.gpx' ? 'No parseable layers' : name === 'bad-coordinates.gpx' ? 'coordinate' : 'Invalid GPX XML');
      assert.equal(await page.locator('.leaflet-control-layers-overlays label').count(), 0);
    }
    await file('unreadable.gpx', rich('Unreadable'));
    await error('Cannot read this file');
    assert.equal(await page.evaluate(() => window.__transport.calls.length), callsBefore, 'Local files never fetch');

    for (const unsafe of ['javascript:alert(1)', 'data:text/xml,test', 'file:///tmp/a.gpx', 'https://user:password@fixture.invalid/a', 'https://fixture.invalid/<script>']) {
      await url(unsafe); await error(unsafe.includes('<') ? 'without spaces' : 'Only relative');
    }
    assert.equal(await page.evaluate(() => window.__transport.calls.length), callsBefore, 'Invalid URLs never fetch');
    await reply('/missing', { body: 'not found', status: 404 });
    await url('https://fixture.invalid/missing'); await error('HTTP 404');
    await reply('/cors', { error: 'Failed to fetch' });
    await url('https://fixture.invalid/cors'); await error('CORS');
    await reply('/bad', { body: '<html>not GPX</html>' });
    await url('https://fixture.invalid/bad'); await error('Invalid GPX XML');

    // Two requests deliberately complete in reverse order, ignoring abort.
    await url('https://fixture.invalid/slow');
    await page.waitForFunction(() => window.__transport.pending['/slow']);
    await url('https://fixture.invalid/fast');
    await page.waitForFunction(() => window.__transport.pending['/fast']);
    await page.evaluate(body => window.__transport.pending['/fast']({ body }), rich('Fast wins'));
    await loaded('Fast wins');
    await page.evaluate(body => window.__transport.pending['/slow']({ body }), rich('Stale URL'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('h3').innerText(), 'Fast wins');
    // A late failure must not erase the new successful selection either.
    await url('https://fixture.invalid/late-error');
    await file('winner.gpx', rich('File wins'));
    await loaded('File wins');
    await page.evaluate(() => window.__transport.pending['/late-error']({ error: 'Stale failure' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('h3').innerText(), 'File wins');

    await file('pending.gpx', rich('Stale file'));
    await page.waitForFunction(() => window.__files.release);
    await url('https://fixture.invalid/rich');
    await loaded('URL rich track');
    await page.evaluate(() => window.__files.release());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('h3').innerText(), 'URL rich track', 'Late File.text cannot replace newer URL');
    await file('pending.gpx', rich('Stale local file'));
    await file('newer.gpx', rich('Newer local file'));
    await loaded('Newer local file');
    await page.evaluate(() => window.__files.release());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('h3').innerText(), 'Newer local file', 'Latest local file wins too');
    await file('pending.gpx', rich('Stale before reset'));
    await page.getByRole('button', { name: 'Reset to sample' }).click();
    await loaded(sampleName);
    await page.evaluate(() => window.__files.release());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('h3').innerText(), sampleName, 'Reset invalidates pending file');
    assert.equal(await page.locator('#gpx-url').inputValue(), '');
    await url('demo.gpx'); await loaded(sampleName);
    assert.ok((await page.locator('h3 a').getAttribute('href')).endsWith('/demo.gpx'), 'Relative URL supported');
    await page.setViewportSize({ width: 220, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Narrow layout has no horizontal overflow');
    if (process.env.SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'demo-controls-mobile.png'), fullPage: true });
    }
    assert.equal(await page.evaluate(() => window.__objectURLs), 0, 'No file object URL lifecycle/leak');
    // Serve the exact app under a mocked HTTPS origin to exercise mixed-content
    // validation without certificates, outside servers or browser flags.
    await page.route('https://viewer.invalid/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
      const body = fs.readFileSync(file, 'utf8') + (pathname === '/gpx.js' ? capture : '');
      return route.fulfill({ body, contentType: mime[path.extname(file)] });
    });
    await page.goto('https://viewer.invalid/');
    await page.waitForFunction(() => document.querySelector('.status').textContent.startsWith('Loaded '));
    const httpsCalls = await page.evaluate(() => window.__transport.calls.length);
    await url('http://fixture.invalid/rich');
    await error('Use HTTPS');
    assert.equal(await page.evaluate(() => window.__transport.calls.length), httpsCalls, 'Mixed-content URL rejected before fetch');
    assert.deepEqual(errors, [], 'No browser pageerrors');
    console.log(`Demo loader (${engine}): local/URL/reset, sparse GPX, safety and source races passed`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
