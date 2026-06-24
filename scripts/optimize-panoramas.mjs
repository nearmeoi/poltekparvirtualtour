/**
 * optimize-panoramas.mjs — make web/phone-friendly copies of the 360 panoramas.
 *
 * Reads the full-res source photos from the backup (READ ONLY — the source is
 * NEVER modified or deleted) and writes downscaled + recompressed copies into
 * public/assets/<venue>/Media/ (which is gitignored, so it stays local).
 *
 * Why: source photos are ~30 MB @ 11968px — far more than any phone screen shows
 * (a 360 viewer displays ~24% of the width at once), and too heavy for low-end
 * GPUs/mobile data. 8192px @ ~5 MB looks identical in the viewer and loads fast.
 *
 * Run:  node scripts/optimize-panoramas.mjs            (skips files already done)
 *       node scripts/optimize-panoramas.mjs --force    (re-process everything)
 * Requires ffmpeg on PATH.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── Tunables ────────────────────────────────────────────────────────────────
const SOURCE_ROOT = process.env.VTD_SRC || 'E:/VTD'; // backup — READ ONLY
const DEST_ROOT   = 'public/assets';                 // gitignored Media folders
const WIDTH       = 8192;  // target width px (height auto-derived, keeps aspect)
const QUALITY     = 3;     // ffmpeg -q:v (2 best … 5 ok); 3 ≈ visually lossless

// Backup folder name → public/assets folder name (only these differ for Museum Kota)
const VENUES = [
    { src: 'Museum Kota', dest: 'Museum Kota Makassar' },
    { src: 'Lagaligo',    dest: 'Lagaligo' },
    { src: 'Panlos',      dest: 'Panlos' },
];

const FORCE = process.argv.includes('--force');
const mb = (b) => (b / 1e6).toFixed(1);

function optimize(srcFile, destFile) {
    // ffmpeg only READS srcFile and WRITES destFile — the source tree is never touched.
    const r = spawnSync('ffmpeg',
        ['-y', '-loglevel', 'error', '-i', srcFile, '-vf', `scale=${WIDTH}:-1`, '-q:v', String(QUALITY), destFile],
        { encoding: 'utf8' });
    return r.status === 0;
}

let total = 0, done = 0, skipped = 0, failed = 0, srcBytes = 0, dstBytes = 0;

for (const v of VENUES) {
    const srcDir = join(SOURCE_ROOT, v.src, 'Media');
    const destDir = join(DEST_ROOT, v.dest, 'Media');
    if (!existsSync(srcDir)) { console.warn(`SKIP venue (no source dir): ${srcDir}`); continue; }
    mkdirSync(destDir, { recursive: true });

    const files = readdirSync(srcDir).filter(f => /\.jpe?g$/i.test(f));
    console.log(`\n${v.src} → ${v.dest}/Media  (${files.length} photos)`);

    for (const f of files) {
        total++;
        const srcFile = join(srcDir, f);
        const destFile = join(destDir, f);
        if (!FORCE && existsSync(destFile)) { skipped++; continue; }

        const s = statSync(srcFile).size;
        if (optimize(srcFile, destFile) && existsSync(destFile)) {
            const d = statSync(destFile).size;
            srcBytes += s; dstBytes += d; done++;
            console.log(`  ✓ ${f}  ${mb(s)}MB → ${mb(d)}MB`);
        } else {
            failed++;
            console.warn(`  ✗ FAILED: ${f}`);
        }
    }
}

console.log(`\nDone. optimized=${done} skipped=${skipped} failed=${failed} / ${total} total`);
if (done) console.log(`Read ${(srcBytes / 1e9).toFixed(2)}GB → wrote ${(dstBytes / 1e9).toFixed(2)}GB (${(100 - dstBytes / srcBytes * 100).toFixed(0)}% smaller).`);
console.log('Source backup (E:/VTD) was only read, never modified.');
