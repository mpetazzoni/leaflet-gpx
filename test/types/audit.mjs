import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guard the hand-maintained declaration and signature fixtures against API drift.
const source = readFileSync(new URL('../../gpx.js', import.meta.url), 'utf8');
const declaration = readFileSync(new URL('../../gpx.d.ts', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const methods = [...source.matchAll(/^  ([a-zA-Z_]\w*)\([^\n]*\) \{/gm)]
  .map(match => match[1]).filter(name => name !== 'constructor' && !name.startsWith('_'));
const declared = [...declaration.slice(declaration.indexOf('export declare class GPX '))
  .matchAll(/^  ([a-zA-Z_]\w*)\(/gm)].map(match => match[1]).filter(name => name !== 'constructor');
assert.deepEqual([...declared].sort(), [...methods].sort(), 'Declarations must cover exactly the runtime public methods');
for (const name of methods) {
  assert.match(fixture, new RegExp(`\\b${name}:`), `${name} needs an exact signature assertion`);
  assert.match(declaration, new RegExp(`/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/\\n  ${name}\\(`), `${name} needs JSDoc`);
}
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const example = readFileSync(new URL('./readme.ts', import.meta.url), 'utf8')
  .replaceAll("'../../gpx.js'", "'leaflet-gpx'").trim();
assert.equal(readme.match(/```typescript\n([^]*?)\n```/)[1], example, 'README TypeScript example must match its compiled fixture');
console.log(`Audited all ${methods.length} GPX public methods against gpx.js and exact signature fixtures.`);
