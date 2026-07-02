/**
 * video-fs.js — DEV-ONLY Vite plugin that streams video files from an
 * arbitrary local directory (VIDEO_BASE) at the /__vtd/ route.
 * Range requests are fully supported so the browser can seek 360° videos.
 * apply:'serve' — never ships in `vite build`.
 */
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

const VIDEO_BASE = 'E:\\VTD';
const CHUNK = 2 * 1024 * 1024; // 2 MB chunk for range requests

function mime(filename) {
    if (/\.webm$/i.test(filename)) return 'video/webm';
    if (/\.mov$/i.test(filename)) return 'video/quicktime';
    return 'video/mp4';
}

export function videoFsPlugin() {
    return {
        name: 'video-fs',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/__vtd', (req, res, next) => {
                // Sanitise path — prevent directory traversal
                const safe = normalize(req.url || '/').replace(/^[\\/]+/, '').replace(/\?.*$/, '');
                if (safe.includes('..')) { res.statusCode = 403; res.end(); return; }

                const filePath = join(VIDEO_BASE, safe);
                if (!existsSync(filePath)) { next(); return; }

                const stat = statSync(filePath);
                if (!stat.isFile()) { next(); return; }

                const total = stat.size;
                const range = req.headers.range;

                if (range) {
                    const [s, e] = range.replace(/bytes=/, '').split('-');
                    const start = parseInt(s, 10);
                    const end = e ? parseInt(e, 10) : Math.min(start + CHUNK - 1, total - 1);
                    const chunkSize = end - start + 1;
                    res.writeHead(206, {
                        'Content-Range': `bytes ${start}-${end}/${total}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunkSize,
                        'Content-Type': mime(filePath),
                        'Cache-Control': 'no-store',
                    });
                    createReadStream(filePath, { start, end }).pipe(res);
                } else {
                    res.writeHead(200, {
                        'Content-Length': total,
                        'Content-Type': mime(filePath),
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'no-store',
                    });
                    createReadStream(filePath).pipe(res);
                }
            });
        },
    };
}
