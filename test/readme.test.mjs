import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const readme = await readFile(new URL('README.md', root), 'utf8');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const module = pkg.type === 'module';
const blocks = [...readme.matchAll(/^```(\w+)\n([\s\S]*?)^```/gm)];
const hover = await readFile(new URL('examples/hover.md', root), 'utf8');
const hoverBlocks = [...hover.matchAll(/^```(\w+)\n([\s\S]*?)^```/gm)];

test('every README and hover example JavaScript block and inline HTML script has valid syntax', () => {
  let checked = 0;
  function check(code, mode) {
    const result = spawnSync(process.execPath, ['--check', '--input-type=' + mode], {
      input: code, encoding: 'utf8',
    });
    assert.equal(result.status, 0, `Documentation script ${++checked}: ${result.stderr}`);
    assert.doesNotMatch(code, /fitToBounds|AwesomeMarkers/);
    if (module) assert.doesNotMatch(code, /\bL\./, 'Leaflet 2 examples use named imports');
  }
  for (const [, language, code] of [...blocks, ...hoverBlocks]) {
    if (language === 'javascript' || language === 'js') check(code, module ? 'module' : 'commonjs');
    if (language !== 'html') continue;
    for (const [, attributes, script] of code.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(attributes)) continue;
      if (/type="importmap"/.test(attributes)) JSON.parse(script);
      else check(script, /type="module"/.test(attributes) ? 'module' : 'commonjs');
    }
  }
  assert.ok(checked >= 12, 'All examples, including the long hover example, are checked');
});

if (module) {
  test('README TypeScript example exactly matches the compiled fixture', async () => {
    const examples = blocks.filter(([ , language]) => language === 'typescript');
    assert.equal(examples.length, 1);
    const fixture = await readFile(new URL('test/types/readme.ts', root), 'utf8');
    assert.equal(examples[0][2].replaceAll("'leaflet-gpx'", "'../../gpx.js'").trim(), fixture.trim());
  });
}

test('local-file example reads XML without requesting it and replaces unsafe waypoint popup HTML', async () => {
  const dom = new JSDOM('<input id="gpx-file" type="file">', {
    url: 'https://example.test/', runScripts: 'outside-only',
  });
  const requests = [], layers = [], failures = [];
  const xml = '<gpx><wpt lat="45" lon="-122"><name><![CDATA[<img src=x onerror=alert(1)>]]></name><desc>Private waypoint</desc></wpt></gpx>';
  let GPX;
  const originalFetch = globalThis.fetch;
  try {
    if (module) {
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
      ({ GPX } = await import('../gpx.js'));
      globalThis.fetch = async url => {
        requests.push(url);
        return { ok: true, text: async () => xml };
      };
    } else {
      const require = createRequire(import.meta.url);
      dom.window.eval(await readFile(require.resolve('leaflet/dist/leaflet.js'), 'utf8'));
      dom.window.eval(await readFile(new URL('gpx.js', root), 'utf8'));
      GPX = dom.window.L.GPX;
      dom.window.XMLHttpRequest = class {
        open(method, url) { requests.push(url); }
        overrideMimeType() {}
        send() {
          this.status = 200;
          this.responseXML = new dom.window.DOMParser().parseFromString(xml, 'text/xml');
          dom.window.setTimeout(() => this.onloadend());
        }
      };
    }
    const map = {
      addLayer(layer) { layers.push(layer); },
      fitBounds(bounds) { assert.ok(bounds.isValid()); },
    };
    const code = readme.split('### Loading local files and URLs')[1]
      .split(/^#{1,6} /m)[0].match(/```javascript\n([\s\S]*?)```/)[1];
    const run = new Function(module ? 'GPX' : 'L', 'document', 'map', 'console', code);
    run(module ? GPX : dom.window.L, dom.window.document, map, {
      error: (...args) => failures.push(args),
    });
    async function loaded(layer) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Missing README loaded event')), 1000);
        layer.once('loaded error', event => {
          clearTimeout(timer);
          event.type === 'loaded' ? resolve() : reject(new Error(event.err));
        });
      });
    }
    await loaded(layers[0]);
    const input = dom.window.document.getElementById('gpx-file');
    Object.defineProperty(input, 'files', { value: [{ text: async () => xml }], configurable: true });
    input.dispatchEvent(new dom.window.Event('change'));
    await Promise.resolve(); // File.text() resolves before constructing the layer.
    assert.equal(layers.length, 2);
    await loaded(layers[1]);
    assert.deepEqual(requests, ['https://mpetazzoni.github.io/leaflet-gpx/demo.gpx']);
    for (const layer of layers) {
      const content = layer.getLayers()[0].getPopup().getContent();
      assert.equal(content.textContent, '<img src=x onerror=alert(1)>\nPrivate waypoint');
      assert.equal(content.querySelector('img'), null, 'Untrusted GPX strings remain text');
    }
    assert.deepEqual(failures, []);
    for (const files of [[], [{ text: async () => 'not XML' }], [{ text: async () => { throw new Error('Read failed'); } }]]) {
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      input.dispatchEvent(new dom.window.Event('change'));
      await Promise.resolve();
      assert.equal(layers.length, 2, 'Cancellation/read failure/non-XML creates no layer');
    }
    assert.equal(failures.length, 2, 'Read and non-XML failures reach the error handler');
    assert.deepEqual(requests, ['https://mpetazzoni.github.io/leaflet-gpx/demo.gpx']);
  } finally {
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
