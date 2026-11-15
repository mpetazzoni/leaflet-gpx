import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';

// Real Leaflet 2 with a DOM: these regressions exercise option normalization
// and popup positioning, rather than merely compiling structural icon types.
const dom = new JSDOM('', { url: 'https://example.test/', pretendToBeVisual: true });
for (const name of ['window', 'document', 'DOMParser', 'Element', 'HTMLElement', 'HTMLImageElement', 'SVGElement']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name];
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
for (const name of ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  globalThis[name] = dom.window[name].bind(dom.window);
}
// jsdom has no layout/resize notifications. Leaflet still performs its real
// initial popup layout and anchor calculation; only later resize callbacks are inert.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
const { GPX } = await import('../../gpx.js');
const { FeatureGroup, Icon, Map, Marker, Polyline } = await import('leaflet');
after(() => dom.window.close());

const xml = '<gpx><rte><rtept lat="0" lon="0"/><rtept lat="0.001" lon="0"/></rte>' +
  '<trk><trkseg><trkpt lat="1" lon="1"><name>Summit</name></trkpt><trkpt lat="1.001" lon="1"/></trkseg>' +
  '<trkseg><trkpt lat="1.002" lon="1"/><trkpt lat="1.003" lon="1"/></trkseg></trk>' +
  '<wpt lat="2" lon="2"><name>Cafe</name><sym>Coffee</sym><type>Hotel</type></wpt></gpx>';

function observe(input, options) {
  const layer = new GPX(input, options);
  const done = new Promise(resolve => layer.on('loaded error', resolve));
  return { layer, done };
}

function leaves(group) {
  return group.getLayers().flatMap(layer => layer instanceof FeatureGroup ? leaves(layer) : [layer]);
}

function createMap() {
  const container = document.createElement('div');
  Object.defineProperties(container, { clientWidth: { value: 600 }, clientHeight: { value: 400 } });
  document.body.append(container);
  const map = new Map(container, { center: [2, 2], zoom: 5, trackResize: false, zoomAnimation: false, fadeAnimation: false });
  return { map, container };
}

for (const async of [false, true]) {
  for (const field of ['wptIcons', 'wptTypeIcons', 'pointMatchers', 'parseElements', 'all']) {
    test(`explicit undefined ${field} retains defaults, async=${async}`, { timeout: 2000 }, async () => {
      const options = { async, markers: {}, gpx_options: {} };
      if (field === 'all') {
        options.markers = { wptIcons: undefined, wptTypeIcons: undefined, pointMatchers: undefined };
        options.gpx_options.parseElements = undefined;
      } else if (field === 'parseElements') {
        options.gpx_options.parseElements = undefined;
      } else {
        options.markers[field] = undefined;
      }
      const result = observe(xml, options);
      const event = await result.done;
      assert.equal(event.type, 'loaded');
      assert.deepEqual(options.gpx_options.parseElements, ['track', 'route', 'waypoint']);
      assert.ok(options.markers.wptIcons[''] instanceof Icon);
      assert.ok(options.markers.wptTypeIcons[''] instanceof Icon);
      assert.deepEqual(options.markers.pointMatchers, []);
      const layers = leaves(result.layer);
      assert.equal(layers.filter(layer => layer instanceof Polyline).length, 2);
      assert.equal(layers.filter(layer => layer instanceof Marker).length, 5);
      assert.ok(result.layer.get_distance() > 0);
    });
  }
}

test('ordinary supplied options stay effective and documented normalization mutates caller objects', { timeout: 2000 }, async () => {
  const wptIcons = { Coffee: 'coffee.png' };
  const wptTypeIcons = { Hotel: 'hotel.png' };
  const rule = { regex: /Summit/, icon: 'summit.png' };
  const markers = { startIcon: 'start.png', endIcon: null, wptIcons, wptTypeIcons, pointMatchers: [rule] };
  const options = {
    async: true, markers,
    marker_options: { iconSize: [20, 30] },
    polyline_options: [{ color: 'purple', weight: 7 }],
    gpx_options: { parseElements: ['track'], joinTrackSegments: false },
  };
  const result = observe(xml, options);
  assert.equal((await result.done).type, 'loaded');
  assert.notEqual(options.markers, markers, 'top-level options gets its merged markers object assigned back');
  assert.equal(options.markers.wptIcons, wptIcons, 'lookup tables retain identity');
  assert.equal(options.markers.wptTypeIcons, wptTypeIcons);
  assert.equal(options.markers.pointMatchers[0], rule);
  for (const icon of [wptIcons.Coffee, wptTypeIcons.Hotel, rule.icon, options.markers.startIcon]) {
    assert.ok(icon instanceof Icon, 'URL entries/rules become Icons in place');
    assert.deepEqual(icon.options.iconSize, [20, 30]);
  }
  assert.equal(options.markers.endIcon, null, 'null endpoint pins stay disabled');
  assert.deepEqual(options.gpx_options.parseElements, ['track']);
  const layers = leaves(result.layer);
  const lines = layers.filter(layer => layer instanceof Polyline);
  assert.equal(lines.length, 2, 'unjoined segments remain separate');
  assert.equal(layers.filter(layer => layer instanceof Marker).length, 3, 'two starts plus one name-matched label');
  for (const line of lines) {
    assert.equal(line.options.color, 'purple');
    assert.equal(line.options.weight, 7);
    assert.ok(line.getLatLngs()[0].meta.time instanceof Date);
  }
});

test('empty containers and an empty selection are not replaced with defaults', { timeout: 2000 }, async () => {
  const options = { markers: { wptIcons: {}, wptTypeIcons: {}, pointMatchers: [] }, gpx_options: { parseElements: [] } };
  const result = observe(xml, options);
  assert.equal((await result.done).type, 'error');
  assert.deepEqual(options.markers.wptIcons, {});
  assert.deepEqual(options.markers.wptTypeIcons, {});
  assert.deepEqual(options.markers.pointMatchers, []);
  assert.deepEqual(options.gpx_options.parseElements, []);
  assert.equal(result.layer.getLayers().length, 0);
});

test('valid string plus undefined top-level options uses ordinary defaults', { timeout: 2000 }, async () => {
  const result = observe(xml, undefined);
  assert.equal((await result.done).type, 'loaded');
  assert.equal(leaves(result.layer).length, 7);
});

test('minimal endpoint-only renderer remains usable without a popup anchor', { timeout: 2000 }, async () => {
  const icon = { options: {}, createIcon: () => document.createElement('div') };
  const result = observe(xml, { async: true, markers: { startIcon: icon, endIcon: icon }, gpx_options: { parseElements: ['track'] } });
  assert.equal((await result.done).type, 'loaded');
  const pins = leaves(result.layer).filter(layer => layer instanceof Marker);
  assert.equal(pins.length, 2);
  const { map, container } = createMap();
  try {
    for (const pin of pins) {
      pin.addTo(map);
      assert.equal(pin.getIcon(), icon);
      assert.ok(pin.getElement() instanceof HTMLElement);
      assert.equal(pin.getPopup(), undefined);
    }
  } finally {
    map.remove();
    container.remove();
  }
});

for (const matching of ['symbol', 'type', 'name']) {
  test(`waypoint-safe structural ${matching} renderer opens its automatic popup on a real Leaflet map`, { timeout: 2000 }, async () => {
    const icon = {
      options: { popupAnchor: [0, -15] },
      createIcon: old => old ?? document.createElement('div'),
    };
    const markers = { wptIcons: {}, wptTypeIcons: {}, pointMatchers: [] };
    if (matching === 'symbol') markers.wptIcons.Coffee = icon;
    if (matching === 'type') markers.wptTypeIcons.Hotel = icon;
    if (matching === 'name') markers.pointMatchers.push({ regex: /Cafe/, icon });
    const result = observe(xml, { markers, gpx_options: { parseElements: ['waypoint'] } });
    assert.equal((await result.done).type, 'loaded');
    const { map, container } = createMap();
    try {
      result.layer.addTo(map);
      const [waypoint] = leaves(result.layer);
      assert.ok(waypoint instanceof Marker);
      assert.equal(waypoint.getIcon(), icon);
      assert.ok(waypoint.getPopup(), 'GPX automatically binds a waypoint popup');
      waypoint.openPopup();
      assert.equal(waypoint.isPopupOpen(), true);
      assert.ok(map.hasLayer(waypoint.getPopup()));
      assert.deepEqual(waypoint._getPopupAnchor(), [0, -15]);
      assert.match(waypoint.getPopup().getElement().textContent, /Cafe/);
    } finally {
      map.remove();
      container.remove();
    }
  });
}
