/**
 * thumb.js — ffmpeg image helpers shared by the admin-fs dev plugin and the
 * batch thumbnail script. Each function only READS srcPath and WRITES destPath.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const THUMB_WIDTH = 320;   // px — small, ~20KB, enough for a picker tile
const FULL_WIDTH = 8192;   // px — matches optimize-panoramas.mjs

function run(args) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
    return r.status === 0;
}

/** Write a ~320px thumbnail of srcPath to destPath. Returns true on success. */
export function makeThumb(srcPath, destPath, { force = false } = {}) {
    if (!force && existsSync(destPath)) return true;
    mkdirSync(dirname(destPath), { recursive: true });
    return run(['-i', srcPath, '-vf', `scale=${THUMB_WIDTH}:-1`, '-q:v', '6', destPath]);
}

/** Write a web-sized (≤8192px) re-encoded copy of srcPath to destPath. */
export function optimizeImage(srcPath, destPath, { width = FULL_WIDTH, quality = 3 } = {}) {
    mkdirSync(dirname(destPath), { recursive: true });
    return run(['-i', srcPath, '-vf', `scale=${width}:-1`, '-q:v', String(quality), destPath]);
}
