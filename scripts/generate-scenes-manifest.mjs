/**
 * generate-scenes-manifest.mjs — build the offline scene catalog for the admin
 * panel. Scans public/assets/<location>/Media/ for every panorama and writes
 * src/data/scenesManifest.json grouped by location, so the admin shows ALL
 * locations dynamically (no hardcoded single-location list). Auto-discovers
 * locations — add a new <location>/Media/ folder and re-run; no code change.
 *
 * Run:  node scripts/generate-scenes-manifest.mjs
 */
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = 'public/assets';
const OUT = 'src/data/scenesManifest.json';

const locations = [];
for (const loc of readdirSync(ASSETS)) {
    const mediaDir = join(ASSETS, loc, 'Media');
    if (!existsSync(mediaDir) || !statSync(mediaDir).isDirectory()) continue;

    const scenes = readdirSync(mediaDir)
        .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()
        .map(f => ({ filename: f, path: `assets/${loc}/Media/${f}` }));

    if (scenes.length) locations.push({ location: loc, count: scenes.length, scenes });
}

writeFileSync(OUT, JSON.stringify(locations, null, 2) + '\n');
const total = locations.reduce((n, l) => n + l.count, 0);
console.log(`Wrote ${OUT}: ${locations.length} locations, ${total} scenes`);
for (const l of locations) console.log(`  ${l.location}: ${l.count}`);
