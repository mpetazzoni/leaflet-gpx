import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'https://example.test/maps/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { GPX } = await import('../gpx.js');
const { Marker } = await import('leaflet');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const points = '<trk><name>Example</name><trkseg><trkpt lat="45" lon="-122"><ele>10</ele></trkpt><trkpt lat="45.001" lon="-122"><ele>11</ele></trkpt></trkseg></trk>';
const xml = '<gpx>' + points + '</gpx>';

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
  assert.equal(result.events.length, 1, 'exactly one terminal event');
  return event;
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
  test(`valid XML, BOM/whitespace, version compatibility, async=${async}`, async () => {
    globalThis.fetch = () => { throw new Error('Inline XML must not fetch'); };
    for (const attrs of ['', 'version="1.0" xmlns="http://www.topografix.com/GPX/1/0"', 'version="1.1" xmlns="http://www.topografix.com/GPX/1/1"']) {
      const result = observe('\uFEFF \n <?xml version="1.0"?><gpx ' + attrs + '>' + points + '</gpx>', { async });
      assert.equal(result.events.length, 0);
      if (!async) {
        assert.equal(result.layer.get_name(), 'Example');
        assert.ok(result.layer.get_distance() > 100);
        assert.ok(result.layer.getLayers().length);
      } else {
        assert.equal(result.layer.getLayers().length, 0);
      }
      await terminal(result, 'loaded');
      assert.equal(result.layer.get_name(), 'Example');
    }
  });

  test(`invalid documents reported without throwing, async=${async}`, async () => {
    const cases = [
      ['<html>' + points + '</html>', /expected a <gpx> root/],
      ['<gpx version="2.0">' + points + '</gpx>', /unsupported version/],
      ['<gpx><trk></gpx>', /Invalid XML/],
      ['<gpx><unbound:extension/></gpx>', /Invalid XML/],
      ['<gpx/>', /No parseable layers/],
      ['<gpx><wpt lat="no" lon="0"/></gpx>', /coordinate/],
    ];
    for (const [input, message] of cases) {
      const result = observe(input, { async });
      await terminal(result, 'error', message);
      assert.equal(result.layer.getLayers().length, 0);
      assert.equal(result.layer.get_distance(), 0);
    }
  });
}

test('invalid input types and obvious file contents never request a URL', async () => {
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('Unexpected request'); };
  for (const input of [null, false, 0, 123, {}, [], new String(xml), '', ' \uFEFF ', 'a,b\n1,2', '-----BEGIN PGP PUBLIC KEY BLOCK-----\nabc', '\u0000JPEG', 'http://[bad', 'not<a>url']) {
    await terminal(observe(input), 'error', /Invalid GPX input|Invalid URL/);
  }
  assert.equal(calls, 0);
  const empty = observe(undefined);
  await delay(5);
  assert.equal(empty.events.length, 0);
  assert.equal(empty.layer.getLayers().length, 0);
});

test('relative, absolute, extensionless, query, blob and data URLs remain inputs', async () => {
  const calls = [];
  globalThis.fetch = async url => { calls.push(url); return { ok: true, text: async () => '\uFEFF \n' + xml }; };
  for (const url of ['demo.gpx', './track with spaces.gpx', '/download?id=1&format=gpx', '//example.test/demo', 'https://example.test/demo?x=1', 'blob:https://example.test/id', 'data:application/xml,%3Cgpx%3E']) {
    await terminal(observe(url), 'loaded');
    assert.equal(calls.at(-1), url);
  }
});

test('fetch failures, synchronous throws, body failures and invalid fetched contents', async () => {
  const cases = [
    [() => { throw new Error('fetch threw'); }, /fetch threw/],
    [async () => { throw new Error('network'); }, /network/],
    [async () => ({ ok: false, statusText: 'Not Found' }), /Not Found/],
    [async () => ({ ok: true, text: async () => { throw new Error('body'); } }), /body/],
    [async () => ({ ok: true, text: async () => 'a,b\n1,2' }), /Invalid XML/],
    [async () => ({ ok: true, text: async () => '<html>' + points + '</html>' }), /Invalid GPX/],
    [async () => ({ ok: true, text: async () => '<gpx><trk></gpx>' }), /Invalid XML/],
  ];
  for (const [fetch, message] of cases) {
    globalThis.fetch = fetch;
    await terminal(observe('demo.gpx'), 'error', message);
  }
});

test('all parsed point types require finite, complete, in-range decimal coordinates', async () => {
  for (const tag of ['wpt', 'rtept', 'trkpt']) {
    for (const attrs of ['lon="0"', 'lat="" lon="0"', 'lat=" " lon="0"', 'lat="NaN" lon="0"', 'lat="Infinity" lon="0"', 'lat="1e999" lon="0"', 'lat="91" lon="0"', 'lat="0" lon="-181"', 'lat="0x10" lon="0"', 'lat="45junk" lon="0"']) {
      let point = '<' + tag + ' ' + attrs + '/>';
      if (tag === 'trkpt') point = '<trk><trkseg>' + point + '</trkseg></trk>';
      if (tag === 'rtept') point = '<rte>' + point + '</rte>';
      await terminal(observe('<gpx>' + point + '</gpx>'), 'error', /coordinate/);
    }
  }
  await terminal(observe('<gpx><rte><rtept lat="-90" lon="180"/><rtept lat="9e1" lon="-180"/></rte></gpx>'), 'loaded');
});

test('unexpected parsing exceptions become error events and clear partial statistics', async () => {
  const original = GPX.prototype._parse_gpx_data;
  GPX.prototype._parse_gpx_data = function() { this._info.length = 123; throw new Error('parser exploded'); };
  try {
    for (const async of [false, true]) {
      const result = observe(xml, { async });
      await terminal(result, 'error', /parser exploded/);
      assert.equal(result.layer.get_distance(), 0);
    }
    globalThis.fetch = async () => ({ ok: true, text: async () => xml });
    await terminal(observe('demo.gpx'), 'error', /parser exploded/);
  } finally { GPX.prototype._parse_gpx_data = original; }
});

test('DOMParser exceptions are reported even when inline parsing is asynchronous', async () => {
  const parser = window.DOMParser;
  window.DOMParser = class { parseFromString() { throw new Error('DOMParser failed'); } };
  try {
    for (const async of [false, true]) await terminal(observe(xml, { async }), 'error', /DOMParser failed/);
  } finally { window.DOMParser = parser; }
});

test('reload retains synchronous getters and deferred terminal event delivery', async () => {
  const result = observe(xml);
  await terminal(result, 'loaded');
  result.layer.reload();
  assert.equal(result.layer.get_name(), 'Example');
  assert.equal(result.events.length, 1);
  await delay(10);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[1].type, 'loaded');
});

test('null and empty parser documents become clear error events', async () => {
  const parser = window.DOMParser;
  try {
    for (const doc of [null, document.implementation.createDocument(null, null)]) {
      window.DOMParser = class { parseFromString() { return doc; } };
      await terminal(observe(xml), 'error', /Invalid XML/);
    }
  } finally { window.DOMParser = parser; }
});

test('async retains addline and addpoint events while terminal events remain deferred', async () => {
  const result = observe(xml, { async: true });
  const additions = [];
  result.layer.on('addline addpoint', e => additions.push(e.type));
  await terminal(result, 'loaded');
  assert.ok(additions.includes('addline'));
  assert.ok(additions.includes('addpoint'));
});

test('out-of-order stale fetch success, malformed XML and network failure cannot erase reload', async () => {
  for (const outcome of ['malformed', 'success', 'network']) {
    const requests = [];
    globalThis.fetch = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
    const result = observe('demo.gpx');
    await delay(0);
    result.layer.reload();
    await delay(0);
    assert.equal(requests.length, 2);
    requests[1].resolve({ ok: true, text: async () => xml });
    await terminal(result, 'loaded');
    const layers = result.layer.getLayers();
    const distance = result.layer.get_distance();
    if (outcome === 'network') requests[0].reject(new Error('stale network failure'));
    else requests[0].resolve({ ok: true, text: async () => outcome === 'success' ? xml.replace('Example', 'Stale') : '<gpx><trk></gpx>' });
    await delay(10);
    assert.equal(result.events.length, 1);
    assert.equal(result.layer.get_name(), 'Example');
    assert.equal(result.layer.get_distance(), distance);
    assert.deepEqual(result.layer.getLayers(), layers);
  }
});

test('reload suppresses already queued inline loaded/error and async parsing callbacks', async () => {
  for (const async of [false, true]) {
    for (const input of [xml.replace('Example', 'Stale'), '<gpx><trk></gpx>']) {
      const result = observe(input, { async });
      result.layer._gpx = xml;
      result.layer.reload();
      await terminal(result, 'loaded');
      assert.equal(result.layer.get_name(), 'Example');
    }
  }
});

test('reload suppresses a transport error queued before its deferred delivery', async () => {
  globalThis.fetch = async () => { throw new Error('stale failure'); };
  const result = observe('demo.gpx');
  // Drain the fetch chain, not the timers delivering terminal events.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  result.layer._gpx = xml;
  result.layer.reload();
  await terminal(result, 'loaded');
});

test('throwing real Leaflet layeradd and layerremove listeners still reset and report one error', async () => {
  for (const input of [xml, 'demo.gpx']) {
    globalThis.fetch = async () => ({ ok: true, text: async () => xml });
    const result = observe(undefined, { async: true });
    let removals = 0;
    let additions = 0;
    result.layer.on('layeradd', () => {
      if (additions++ === 0) result.layer.addLayer(new Marker([0, 0]));
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
});

test('terminal listener exceptions are not caught as transport failures or delivered twice', async () => {
  const timers = [];
  const originalTimer = globalThis.setTimeout;
  globalThis.setTimeout = cb => { timers.push(cb); };
  let result;
  try {
    globalThis.fetch = async () => { throw new Error('network failure'); };
    result = observe('demo.gpx');
    result.layer.on('error', () => { throw new Error('terminal listener failed'); });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(timers.length, 1);
    assert.throws(() => timers[0](), /terminal listener failed/);
    assert.equal(result.events.length, 1);
    assert.equal(timers.length, 1);
  } finally { globalThis.setTimeout = originalTimer; }
});

test('relative URL in about:blank resolves using an absolute document base', async () => {
  const base = document.createElement('base');
  base.href = 'https://example.test/inherited/';
  document.head.appendChild(base);
  dom.reconfigure({ url: 'about:blank' });
  try {
    const calls = [];
    globalThis.fetch = async url => { calls.push(url); return { ok: true, text: async () => xml }; };
    assert.equal(window.location.href, 'about:blank');
    assert.equal(document.baseURI, base.href);
    await terminal(observe('demo.gpx'), 'loaded');
    assert.deepEqual(calls, ['demo.gpx']);
  } finally { base.remove(); dom.reconfigure({ url: 'https://example.test/maps/' }); }
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
      pointMatchers: [{ regex: /POI/, icon: new Marker([0, 0]).options.icon }]
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
  const doc = new window.DOMParser().parseFromString(xml, 'text/xml');
  const layer = new GPX();
  assert.ok(layer._parse_gpx_data(doc, layer.options));
  layer._init_info();
  assert.ok(layer._parse_segment(doc.getElementsByTagName('trk')[0], layer.options, {}, {}, 'trkpt').length);
  assert.equal(layer.get_name(), null);
  assert.ok(layer.get_distance() > 100);
});
