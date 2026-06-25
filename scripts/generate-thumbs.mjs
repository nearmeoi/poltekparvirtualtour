/**
 * generate-thumbs.mjs — make ~320px thumbnails for every panorama so the admin
 * ScenePicker stays light. Writes to public/assets/<loc>/Media/.thumbs/<file>.
 * Run:  node scripts/generate-thumbs.mjs            (skips existing)
 *       node scripts/generate-thumbs.mjs --force    (rebuild all)
 * Requires ffmpeg on PATH.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeThumb } from '../vite-plugins/thumb.js';

const ASSETS = 'public/assets';
const IMG_RE = /\.(jpe?g|png|webp)$/i;
const FORCE = process.argv.includes('--force');

let made = 0, skipped = 0, failed = 0;
for (const loc of readdirSync(ASSETS)) {
    const mediaDir = join(ASSETS, loc, 'Media');
    if (!existsSync(mediaDir) || !statSync(mediaDir).isDirectory()) continue;
    const thumbsDir = join(mediaDir, '.thumbs');
    for (const f of readdirSync(mediaDir)) {
        if (!IMG_RE.test(f)) continue;
        const src = join(mediaDir, f);
        if (!statSync(src).isFile()) continue;
        const dest = join(thumbsDir, f);
        if (!FORCE && existsSync(dest)) { skipped++; continue; }
        if (makeThumb(src, dest, { force: FORCE })) { made++; console.log(`  ✓ ${loc}/${f}`); }
        else { failed++; console.warn(`  ✗ ${loc}/${f}`); }
    }
}
console.log(`\nThumbs: made=${made} skipped=${skipped} failed=${failed}`);
