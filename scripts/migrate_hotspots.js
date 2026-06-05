
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const museumDir = path.resolve(__dirname, '../../public/assets/Museum Kota Makassar');
const hotspotsFile = path.resolve(__dirname, '../../src/data/hotspots.json');

console.log('Reading directory:', museumDir);

try {
    const files = fs.readdirSync(museumDir).filter(f => f.match(/\.(jpg|jpeg|png)$/i));

    // Read existing hotspots to try and preserve data if possible?
    // User said "ganti hotspot json itu menjadi semua nama file".
    // "Ganti" = Replace.
    // I will try to map existing IDs to new Paths if they match, but primarily populate with Paths.

    let existingData = {};
    if (fs.existsSync(hotspotsFile)) {
        existingData = JSON.parse(fs.readFileSync(hotspotsFile, 'utf8'));
    }

    const newHotspots = {};

    files.forEach(file => {
        const filePath = 'assets/Museum Kota Makassar/' + file;

        // Check if we have data for this file (maybe by ID inside filename?)
        // e.g. "001_..." -> ID "001"
        // Let's try to find an existing key that matches.

        // 1. Direct path match (unlikely if we just switched)
        if (existingData[filePath]) {
            newHotspots[filePath] = existingData[filePath];
        }
        // 2. ID match?
        else {
            // Extract ID from filename? e.g. "001"
            const match = file.match(/^(\d+)_/);
            if (match) {
                const id = match[1]; // "001"
                // Check if existingData has this ID (maybe as number or string)
                // Note: hotspots.json keys might be "001" or "panorama_1", etc.
                // Looking at previous valid hotspots.json content would help, but let's assume keys were IDs.

                // Try strict ID
                if (existingData[id]) {
                    newHotspots[filePath] = existingData[id];
                } else {
                    // New entry
                    newHotspots[filePath] = [];
                }
            } else {
                newHotspots[filePath] = [];
            }
        }
    });

    console.log(`Generated ${Object.keys(newHotspots).length} entries.`);

    fs.writeFileSync(hotspotsFile, JSON.stringify(newHotspots, null, 2));
    console.log('Successfully wrote to hotspots.json');

} catch (err) {
    console.error('Error:', err);
}
