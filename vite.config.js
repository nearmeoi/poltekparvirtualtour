import { defineConfig } from 'vite';
import { adminFsPlugin } from './vite-plugins/admin-fs.js';

export default defineConfig({
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: false,
        cors: true,
        hmr: true,
        watch: {
            ignored: ['**/hotspots.json']
        }
    },
    plugins: [adminFsPlugin()]
});
