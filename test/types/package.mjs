import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Compile the same fixtures from an isolated npm-installed tarball, without
// local path aliases, symlinks, @types/leaflet, or skipLibCheck.
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./', import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), 'leaflet-gpx-types-'));
const npm = (args, cwd = consumer) => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
try {
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', consumer], root));
  for (const file of ['gpx.js', 'gpx.d.ts', 'package.json', 'README.md']) {
    assert.ok(packed.files.some(entry => entry.path === file), `Tarball is missing ${file}`);
  }
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'gpx-types-consumer', private: true, type: 'module' }));
  const { packages } = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const leafletVersion = packages['node_modules/leaflet'].version;
  const typescriptVersion = packages['node_modules/typescript'].version;
  console.log(npm(['install', '--ignore-scripts', '--no-audit', '--no-fund',
    join(consumer, packed.filename), `leaflet@${leafletVersion}`, `typescript@${typescriptVersion}`]));
  for (const file of readdirSync(fixtures)) {
    if (file.endsWith('.ts')) {
      const contents = readFileSync(join(fixtures, file), 'utf8').replaceAll("'../../gpx.js'", "'leaflet-gpx'");
      writeFileSync(join(consumer, file), contents);
    } else if (file.startsWith('tsconfig') && file.endsWith('.json')) {
      copyFileSync(join(fixtures, file), join(consumer, file));
    }
  }
  const installed = JSON.parse(readFileSync(join(consumer, 'node_modules/leaflet-gpx/package.json'), 'utf8'));
  assert.equal(installed.types, 'gpx.d.ts');
  assert.equal(installed.main, 'gpx.js');
  assert.ok(!readdirSync(join(consumer, 'node_modules/@types')).includes('leaflet'), 'Must use Leaflet 2 bundled types');
  for (const config of ['tsconfig.json', 'tsconfig.bundler.json']) {
    console.log(npm(['exec', '--', 'tsc', '-p', config]));
    console.log(`Installed tarball consumer passed ${config}.`);
  }
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
