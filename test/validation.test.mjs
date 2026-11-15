import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

// Execute the actual classic Leaflet and GPX scripts in a browser-like VM.
const require = createRequire(import.meta.url);
const dom = new JSDOM('', { url: 'https://example.test/maps/', runScripts: 'outside-only' });
dom.window.eval(await readFile(require.resolve('leaflet/dist/leaflet.js'), 'utf8'));
const gpxURL = new URL('../gpx.js', import.meta.url);
dom.window.eval((await readFile(gpxURL, 'utf8')) + '\n//# sourceURL=' + gpxURL.href);
const { GPX } = dom.window.L;
const originalXHR = dom.window.XMLHttpRequest;
afterEach(() => { dom.window.XMLHttpRequest = originalXHR; });
const points = '<trk><name>Example</name><trkseg><trkpt lat="45" lon="-122"><ele>10</ele></trkpt><trkpt lat="45.001" lon="-122"><ele>11</ele></trkpt></trkseg></trk>';
const xml = '<gpx>' + points + '</gpx>';
const parseXML = text => new dom.window.DOMParser().parseFromString(text, 'text/xml');

function observe(input, options) {
  const layer = new GPX(input, options);
  const events = [];
  let resolve;
  const done = new Promise(r => { resolve = r; });
  layer.on('loaded error', e => { events.push(e); resolve(e); });
  return { layer, events, done };
}
async function terminal(result, type, message) {
  const event = await Promise.race([result.done, delay(1000).then(() => { throw new Error('Missing terminal event'); })]);
  assert.equal(event.type, type);
  if (message) assert.match(event.err, message);
  await delay(5);
  assert.equal(result.events.length, 1);
  return event;
}
function mockXHR({ text = xml, status = 200, throws, nullXML = false, getterThrows = false, double = false, responseText } = {}) {
  const calls = [];
  dom.window.XMLHttpRequest = class {
    constructor() { if (throws === 'constructor') throw new Error('constructor failed'); }
    open(method, url, async) { calls.push({ method, url, async }); this.async = async; if (throws === 'open') throw new Error('open failed'); }
    overrideMimeType() { if (throws === 'mime') throw new Error('unsupported'); }
    get status() { if (getterThrows) throw new Error('status failed'); return status; }
    get responseXML() { return nullXML ? null : parseXML(text); }
    get responseText() { return responseText; }
    send() {
      if (throws === 'send') throw new Error('send failed');
      const finish = () => { this.onloadend(); if (double) this.onloadend(); };
      if (this.async) dom.window.setTimeout(finish);
      else finish();
      if (throws === 'after') throw new Error('after completion');
    }
  };
  return calls;
}

for (const event of ['addline', 'addpoint']) {
  test(`synchronous reload inside ${event} stops superseded events and statistics`, async () => {
    const replacement = '<gpx><trk><name>Replacement</name><trkseg>' +
      '<trkpt lat="40" lon="0"><ele>100</ele><time>2026-01-01T00:00:00Z</time></trkpt>' +
      '<trkpt lat="40.002" lon="0"><ele>110</ele><time>2026-01-01T00:00:10Z</time></trkpt>' +
      '</trkseg></trk></gpx>';
    const expected = observe(replacement);
    await terminal(expected, 'loaded');
    const result = observe('<gpx>' + points + points + '</gpx>', { async: true });
    let replaced = false;
    const staleEvents = [];
    result.layer.on('addline addpoint', e => {
      if (replaced && e.element.textContent.includes('Example')) staleEvents.push(e.type);
      if (!replaced && e.type === event) {
        replaced = true;
        result.layer._gpx = replacement;
        result.layer.options.async = false;
        result.layer.reload();
      }
    });
    await terminal(result, 'loaded');
    assert.ok(replaced);
    assert.deepEqual(result.layer._info, expected.layer._info);
    assert.equal(result.layer.getLayers().length, expected.layer.getLayers().length);
    assert.deepEqual(staleEvents, []);
  });
}

for (const async of [undefined, false, true]) {
  test(`inline valid and invalid XML, deferred terminal events, async=${async}`, async () => {
    const calls = mockXHR();
    for (const attrs of ['', 'version="1.0" xmlns="http://www.topografix.com/GPX/1/0"', 'version="1.1" xmlns="http://www.topografix.com/GPX/1/1"']) {
      const result = observe('\uFEFF \n <?xml version="1.0"?><gpx ' + attrs + '>' + points + '</gpx>', { async });
      assert.equal(result.events.length, 0);
      if (!async) { assert.equal(result.layer.get_name(), 'Example'); assert.ok(result.layer.get_distance() > 100); }
      else assert.equal(result.layer.getLayers().length, 0);
      await terminal(result, 'loaded');
    }
    for (const [input, message] of [['<html>' + points + '</html>', /expected a <gpx> root/], ['<gpx version="2.0"/>', /unsupported version/], ['<gpx><trk></gpx>', /Invalid XML/], ['<gpx><unbound:extension/></gpx>', /Invalid XML/], ['<gpx/>', /No parseable layers/]]) {
      await terminal(observe(input, { async }), 'error', message);
    }
    assert.equal(calls.length, 0);
  });
  test(`XHR success and failures, sync getters, async=${async}`, async () => {
    mockXHR({ double: true });
    const result = observe('demo.gpx', { async });
    assert.equal(result.events.length, 0);
    if (!async) { assert.equal(result.layer.get_name(), 'Example'); assert.ok(result.layer.get_distance() > 100); }
    await terminal(result, 'loaded');
    for (const [config, message] of [[{ status: 404 }, /HTTP 404/], [{ status: 0 }, /HTTP 0/], [{ nullXML: true }, /Invalid XML/], [{ text: '<html>' + points + '</html>' }, /Invalid GPX/], [{ text: '<gpx><trk></gpx>' }, /Invalid XML/], [{ getterThrows: true }, /status failed/], [{ throws: 'constructor' }, /constructor failed/], [{ throws: 'open' }, /open failed/], [{ throws: 'send' }, /send failed/]]) {
      mockXHR(config);
      await terminal(observe('demo.gpx', { async }), 'error', message);
    }
    mockXHR({ throws: 'mime' });
    await terminal(observe('demo.gpx', { async }), 'loaded');
    mockXHR({ nullXML: true, responseText: '\uFEFF \n <?xml version="1.0"?>' + xml });
    await terminal(observe('demo.gpx', { async }), 'loaded');
    mockXHR({ nullXML: true, responseText: 'a,b\n1,2' });
    await terminal(observe('demo.gpx', { async }), 'error', /Invalid XML/);
  });
}

test('invalid types, CSV, PGP, binary and malformed URL rejected before XHR', async () => {
  const calls = mockXHR();
  for (const input of [null, false, 0, 123, {}, [], new String(xml), '', ' \uFEFF ', 'a,b\n1,2', '-----BEGIN PGP PUBLIC KEY BLOCK-----\nabc', '\u0000JPEG', 'http://[bad', 'not<a>url']) {
    await terminal(observe(input), 'error', /Invalid GPX input|Invalid URL/);
  }
  assert.equal(calls.length, 0);
  const empty = observe(undefined);
  await delay(5);
  assert.equal(empty.events.length, 0);
});

test('URL paths, extensionless endpoints, queries and special schemes remain inputs', async () => {
  const calls = mockXHR();
  for (const url of ['demo.gpx', './track with spaces.gpx', '/download?id=1&format=gpx', '//example.test/demo', 'https://example.test/demo?x=1', 'blob:https://example.test/id', 'data:application/xml,%3Cgpx%3E']) {
    await terminal(observe(url), 'loaded');
    assert.equal(calls.at(-1).url, url);
  }
});

test('finite complete in-range coordinates required for track, route and waypoint', async () => {
  for (const tag of ['wpt', 'rtept', 'trkpt']) {
    for (const attrs of ['lon="0"', 'lat="" lon="0"', 'lat=" " lon="0"', 'lat="NaN" lon="0"', 'lat="Infinity" lon="0"', 'lat="1e999" lon="0"', 'lat="91" lon="0"', 'lat="0" lon="-181"', 'lat="0x10" lon="0"', 'lat="45junk" lon="0"']) {
      let point = '<' + tag + ' ' + attrs + '/>';
      if (tag === 'trkpt') point = '<trk><trkseg>' + point + '</trkseg></trk>';
      if (tag === 'rtept') point = '<rte>' + point + '</rte>';
      const result = observe('<gpx>' + point + '</gpx>');
      await terminal(result, 'error', /coordinate/);
      assert.equal(result.layer.getLayers().length, 0);
      assert.equal(result.layer.get_distance(), 0);
    }
  }
  await terminal(observe('<gpx><rte><rtept lat="-90" lon="180"/><rtept lat="9e1" lon="-180"/></rte></gpx>'), 'loaded');
});

test('parser exceptions reported for inline and XHR, partial statistics cleared', async () => {
  const original = GPX.prototype._parse_gpx_data;
  GPX.prototype._parse_gpx_data = function() { this._info.length = 123; throw new Error('parser exploded'); };
  try {
    for (const async of [false, true]) {
      const result = observe(xml, { async });
      await terminal(result, 'error', /parser exploded/);
      assert.equal(result.layer.get_distance(), 0);
      mockXHR();
      await terminal(observe('demo.gpx', { async }), 'error', /parser exploded/);
    }
  } finally { GPX.prototype._parse_gpx_data = original; }
});

test('DOMParser throws and reload remain safe with deferred terminal events', async () => {
  const parser = dom.window.DOMParser;
  dom.window.DOMParser = class { parseFromString() { throw new Error('DOMParser failed'); } };
  try {
    for (const async of [false, true]) await terminal(observe(xml, { async }), 'error', /DOMParser failed/);
  } finally { dom.window.DOMParser = parser; }
  const result = observe(xml);
  await terminal(result, 'loaded');
  result.layer.reload();
  assert.equal(result.layer.get_name(), 'Example');
  assert.equal(result.events.length, 1);
  await delay(10);
  assert.equal(result.events.length, 2);
});

test('XHR loadend followed by send exception produces only one event', async () => {
  mockXHR({ throws: 'after' });
  await terminal(observe('demo.gpx'), 'loaded');
  mockXHR({ throws: 'after', status: 500 });
  await terminal(observe('demo.gpx'), 'error', /HTTP 500/);
});

test('async retains addline and addpoint events while terminal events remain deferred', async () => {
  const result = observe(xml, { async: true });
  const additions = [];
  result.layer.on('addline addpoint', e => additions.push(e.type));
  await terminal(result, 'loaded');
  assert.ok(additions.includes('addline'));
  assert.ok(additions.includes('addpoint'));
});

test('out-of-order stale XHR success, malformed XML and HTTP failure cannot erase reload', async () => {
  for (const outcome of ['malformed', 'success', 'network']) {
    const requests = [];
    dom.window.XMLHttpRequest = class {
      constructor() { requests.push(this); }
      open() {}
      overrideMimeType() {}
      send() {}
      finish(text, status = 200) { this.status = status; this.responseXML = parseXML(text); this.onloadend(); }
    };
    const result = observe('demo.gpx', { async: true });
    result.layer.reload();
    assert.equal(requests.length, 2);
    requests[1].finish(xml);
    await terminal(result, 'loaded');
    const layers = result.layer.getLayers();
    const distance = result.layer.get_distance();
    requests[0].finish(outcome === 'success' ? xml.replace('Example', 'Stale') : '<gpx><trk></gpx>', outcome === 'network' ? 500 : 200);
    await delay(10);
    assert.equal(result.events.length, 1);
    assert.equal(result.layer.get_name(), 'Example');
    assert.equal(result.layer.get_distance(), distance);
    assert.deepEqual(result.layer.getLayers(), layers);
  }
});

test('reload suppresses queued inline loaded/error, XHR errors and async parsing callbacks', async () => {
  for (const async of [false, true]) {
    for (const input of [xml.replace('Example', 'Stale'), '<gpx><trk></gpx>']) {
      const result = observe(input, { async });
      result.layer._gpx = xml;
      result.layer.reload();
      await terminal(result, 'loaded');
      assert.equal(result.layer.get_name(), 'Example');
    }
  }
  for (const config of [{ status: 500 }, { throws: 'open' }, { text: xml.replace('Example', 'Stale') }]) {
    mockXHR(config);
    const result = observe('demo.gpx');
    result.layer._gpx = xml;
    result.layer.reload();
    await terminal(result, 'loaded');
  }
});

test('throwing real Leaflet layeradd/layerremove listeners reset and report one error, sync or async', async () => {
  for (const async of [false, true]) {
    for (const input of [xml, 'demo.gpx']) {
      mockXHR({ double: true });
      const result = observe(undefined, { async });
      let removals = 0;
      let additions = 0;
      result.layer.on('layeradd', () => {
        if (additions++ === 0) result.layer.addLayer(new dom.window.L.Marker([0, 0]));
        throw new Error('layeradd failed');
      });
      result.layer.on('layerremove', () => { removals++; throw new Error('layerremove failed'); });
      result.layer._gpx = input;
      result.layer.reload();
      await terminal(result, 'error', /layeradd failed.*cleanup:.*layerremove failed/);
      assert.equal(removals, 2, 'cleanup continues after the first layerremove throws');
      assert.equal(result.layer.getLayers().length, 0);
      assert.equal(result.layer.get_distance(), 0);
      assert.equal(result.layer.get_name(), null);
    }
  }
});

test('terminal listener exceptions are not caught as duplicate transport completion', () => {
  const timers = [];
  const originalTimer = dom.window.setTimeout;
  dom.window.setTimeout = cb => { timers.push(cb); };
  try {
    mockXHR({ status: 500, double: true });
    const result = observe('demo.gpx');
    result.layer.on('error', () => { throw new Error('terminal listener failed'); });
    assert.equal(timers.length, 1);
    assert.throws(() => timers[0](), /terminal listener failed/);
    assert.equal(result.events.length, 1);
    assert.equal(timers.length, 1);
  } finally { dom.window.setTimeout = originalTimer; }
});

test('relative URL in about:blank resolves using an absolute document base', async () => {
  const base = dom.window.document.createElement('base');
  base.href = 'https://example.test/inherited/';
  dom.window.document.head.appendChild(base);
  dom.reconfigure({ url: 'about:blank' });
  try {
    const calls = mockXHR();
    assert.equal(dom.window.location.href, 'about:blank');
    assert.equal(dom.window.document.baseURI, base.href);
    await terminal(observe('demo.gpx'), 'loaded');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'demo.gpx');
  } finally { base.remove(); dom.reconfigure({ url: 'https://example.test/maps/' }); }
});

test('XHR callback escape reports one error instead of being swallowed by completion guard', async () => {
  mockXHR({ double: true, throws: 'after' });
  const layer = new GPX();
  const errors = [];
  let callbacks = 0;
  layer._load_xml('demo.gpx', () => { callbacks++; throw new Error('callback escaped'); }, layer.options, false,
    message => { errors.push(message); }, () => true);
  assert.equal(callbacks, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /callback escaped/);
});

test('addline and every addpoint type can reload synchronously without resuming old statistics or events', async () => {
  const segment = (lat, delta, ele, year, hr) => '<trkseg>' +
    `<trkpt lat="${lat}" lon="-122"><name>POI first</name><ele>${ele}</ele><time>${year}-01-01T00:00:00Z</time><extensions><hr>${hr}</hr></extensions></trkpt>` +
    `<trkpt lat="${lat + delta}" lon="-122"><name>POI last</name><ele>${ele + 40}</ele><time>${year}-01-01T00:00:10Z</time><extensions><hr>${hr + 2}</hr></extensions></trkpt></trkseg>`;
  const newXML = '<gpx id="new"><metadata><name>New only</name></metadata><trk>' + segment(45, 0.001, 10, 2026, 100) + '</trk></gpx>';
  const oldTracks = '<trk><name>Old first</name>' + segment(10, 0.03, 100, 2020, 200) + segment(20, 0.1, 300, 2021, 210) +
    '</trk><trk><name>Old second</name>' + segment(30, 0.5, 700, 2022, 220) + '</trk>';
  const route = '<rte>' + segment(5, 0.02, 1000, 2019, 230).replaceAll('trkpt', 'rtept').replace('<trkseg>', '').replace('</trkseg>', '') + '</rte>';
  const oldXML = prefix => '<gpx id="old"><metadata><name>Old</name></metadata>' + prefix + oldTracks +
    '<wpt lat="1" lon="2"><name>POI waypoint</name></wpt><wpt lat="3" lon="4"><name>POI another</name></wpt></gpx>';
  const layerShape = layer => layer.getLayers ? layer.getLayers().map(layerShape) :
    layer.getLatLngs ? layer.getLatLngs().map(p => [p.lat, p.lng]) : [layer.getLatLng().lat, layer.getLatLng().lng];
  for (const [trigger, joinTrackSegments, prefix] of [['addline', true, ''], ['addline', false, ''], ['addline', true, route],
    ['start', true, ''], ['end', true, ''], ['label', true, ''], ['waypoint', true, '']]) {
    const options = { async: false, gpx_options: { joinTrackSegments }, markers: {
      pointMatchers: [{ regex: /POI/, icon: new dom.window.L.Marker([0, 0]).options.icon }]
    } };
    const expected = new GPX(newXML, options);
    const result = observe(undefined, options);
    let reloaded = false;
    let oldEvents = 0;
    let eventsAtReload = 0;
    result.layer.on('addline addpoint', e => {
      if (e.element.ownerDocument.documentElement.getAttribute('id') !== 'old') return;
      oldEvents++;
      if (!reloaded && (e.type === trigger || e.point_type === trigger)) {
        reloaded = true;
        eventsAtReload = oldEvents;
        result.layer._gpx = newXML;
        result.layer.reload();
      }
    });
    result.layer._gpx = oldXML(prefix);
    result.layer.reload();
    await terminal(result, 'loaded');
    assert.ok(reloaded, trigger);
    assert.equal(oldEvents, eventsAtReload, 'no old addline/addpoint events after reload');
    assert.equal(result.layer.get_name(), expected.get_name());
    assert.equal(result.layer.get_distance(), expected.get_distance());
    assert.equal(result.layer.get_start_time().getTime(), expected.get_start_time().getTime());
    assert.equal(result.layer.get_end_time().getTime(), expected.get_end_time().getTime());
    assert.equal(JSON.stringify(result.layer._info), JSON.stringify(expected._info), 'all statistics belong to the new GPX');
    assert.deepEqual(layerShape(result.layer), layerShape(expected), 'only new layers remain');
  }
});

test('direct data and segment parsing remain usable without a generation predicate', () => {
  const doc = parseXML(xml);
  const layer = new GPX();
  assert.ok(layer._parse_gpx_data(doc, layer.options));
  layer._init_info();
  assert.ok(layer._parse_segment(doc.getElementsByTagName('trk')[0], layer.options, {}, {}, 'trkpt').length);
  assert.equal(layer.get_name(), null);
  assert.ok(layer.get_distance() > 100);
});
