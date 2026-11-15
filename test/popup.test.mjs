import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', {
  url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
let GPX, createMap;
if (pkg.type === 'module') {
  for (const name of ['window', 'document', 'DOMParser', 'Element', 'HTMLElement', 'HTMLImageElement', 'SVGElement']) {
    globalThis[name] = name === 'window' ? dom.window : dom.window[name];
  }
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  for (const name of ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    globalThis[name] = dom.window[name].bind(dom.window);
  }
  // Only resize callbacks are stubbed; Leaflet renders the actual popup DOM.
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ GPX } = await import('../gpx.js'));
  const { Map } = await import('leaflet');
  createMap = (container, options) => new Map(container, options);
} else {
  const require = createRequire(import.meta.url);
  dom.window.eval(await readFile(require.resolve('leaflet/dist/leaflet.js'), 'utf8'));
  dom.window.eval(await readFile(new URL('../gpx.js', import.meta.url), 'utf8'));
  GPX = dom.window.L.GPX;
  createMap = (container, options) => dom.window.L.map(container, options);
}
after(() => dom.window.close());

const cases = [
  ['plain text', 'Trailhead', 'Drinking water nearby'],
  ['image and SVG handlers', '<img src=x onerror="window.pwned=true">', '<svg onload="window.pwned=true"></svg>'],
  ['closing tags and scripts', '</b><script>window.pwned=true</script><b>', '<iframe srcdoc="<script>window.pwned=true</script>"></iframe>'],
  ['entity-looking text', '&lt;img src=x onerror=alert(1)&gt;', '&#60;svg onload=alert(1)&#62;'],
  ['quotes, ampersands and Unicode', 'Café & "coffee" <here>', "Water & 'shade' > there"],
  ['links and formatting', '<a href="javascript:alert(1)">Click</a>', '<strong>Not markup</strong>'],
  ['empty description', 'Start', ''],
  ['empty name and description', '', ''],
];
const encode = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

for (const [label, name, desc] of cases) {
  test(`waypoint popup safely displays ${label}`, { timeout: 3000 }, async () => {
    for (const cdata of [false, true]) {
      const text = value => cdata ? '<![CDATA[' + value + ']]>' : encode(value);
      const xml = '<gpx><wpt lat="0" lon="0"><name>' + text(name) +
        '</name><desc>' + text(desc) + '</desc></wpt></gpx>';
      const layer = new GPX(xml, { async: true });
      const event = await new Promise(resolve => layer.on('loaded error', resolve));
      assert.equal(event.type, 'loaded', event.err);
      const [marker] = layer.getLayers();
      const container = dom.window.document.createElement('div');
      Object.defineProperties(container, { clientWidth: { value: 600 }, clientHeight: { value: 400 } });
      dom.window.document.body.append(container);
      const map = createMap(container, {
        center: [0, 0], zoom: 5, trackResize: false, zoomAnimation: false, fadeAnimation: false,
      });
      try {
        layer.addTo(map);
        marker.openPopup();
        assert.ok(marker.isPopupOpen());
        const content = marker.getPopup().getElement().querySelector('.leaflet-popup-content');
        assert.equal(content.textContent, name + desc, 'XML decoding must not alter the displayed text');
        assert.equal(content.querySelector('b').textContent, name, 'Keep the bold name wrapper');
        assert.equal(content.querySelectorAll('br').length, desc ? 1 : 0);
        assert.deepEqual(Array.from(content.querySelectorAll('*'), node => node.tagName), desc ? ['B', 'BR'] : ['B']);
        assert.equal(marker.options.title, name, 'Marker title remains the original plain string');
      } finally {
        map.remove();
        container.remove();
      }
    }
  });
}
