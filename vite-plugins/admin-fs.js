/**
 * admin-fs.js — DEV-ONLY Vite plugin powering the admin hotspot manager.
 * apply:'serve' means it never ships in `vite build` (production).
 *   GET  /__admin/scenes                       → live folder scan
 *   POST /__admin/upload?location=&name=       → save + optimize + thumbnail
 * Writes only under public/assets/<loc>/Media/. Never touches E:/VTD.
 */
import { readdirSync, statSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { makeThumb, optimizeImage } from './thumb.js';

const ASSETS = 'public/assets';
const IMG_RE = /\.(jpe?g|png|webp)$/i;
const BAD = (s) => !s || /[\\/]|\.\./.test(s);

function scanScenes() {
    const locations = [];
    for (const loc of readdirSync(ASSETS)) {
        const mediaDir = join(ASSETS, loc, 'Media');
        if (!existsSync(mediaDir) || !statSync(mediaDir).isDirectory()) continue;
        const scenes = readdirSync(mediaDir)
            .filter(f => IMG_RE.test(f) && statSync(join(mediaDir, f)).isFile())
            .sort()
            .map(f => ({
                filename: f,
                path: `assets/${loc}/Media/${f}`,
                thumb: `assets/${loc}/Media/.thumbs/${f}`,
            }));
        if (scenes.length) locations.push({ location: loc, count: scenes.length, scenes });
    }
    return locations;
}

function send(res, code, obj) {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
}

export function adminFsPlugin() {
    return {
        name: 'admin-fs',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url || '';
                if (req.method === 'GET' && url.startsWith('/__admin/scenes')) {
                    try { send(res, 200, scanScenes()); }
                    catch (e) { send(res, 500, { error: String(e) }); }
                    return;
                }
                if (req.method === 'POST' && url.startsWith('/__admin/upload')) {
                    const params = new URLSearchParams(url.split('?')[1] || '');
                    const location = params.get('location') || '';
                    const name = params.get('name') || '';
                    if (BAD(location)) return send(res, 400, { error: 'bad location' });
                    if (BAD(name) || !IMG_RE.test(name)) return send(res, 400, { error: 'bad filename' });
                    const mediaDir = join(ASSETS, location, 'Media');
                    if (!existsSync(mediaDir)) return send(res, 400, { error: 'unknown location' });

                    const chunks = [];
                    req.on('data', (c) => chunks.push(c));
                    req.on('end', () => {
                        try {
                            const tmp = join(mediaDir, `.upload-tmp-${name}`);
                            writeFileSync(tmp, Buffer.concat(chunks));
                            const dest = join(mediaDir, name);
                            const optimized = optimizeImage(tmp, dest);
                            if (!optimized) writeFileSync(dest, Buffer.concat(chunks)); // fallback: store raw
                            try { unlinkSync(tmp); } catch {}
                            const thumbOk = makeThumb(dest, join(mediaDir, '.thumbs', name), { force: true });
                            send(res, 200, {
                                filename: name,
                                path: `assets/${location}/Media/${name}`,
                                thumb: `assets/${location}/Media/.thumbs/${name}`,
                                thumbOk,
                            });
                        } catch (e) { send(res, 500, { error: String(e) }); }
                    });
                    return;
                }
                next();
            });
        },
    };
}
