import express from 'express';
import cors from 'cors';
import fetchPlaylist from './api/fetchPlaylist.js';
import searchVideos from './api/searchVideos.js';

const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

// Root route for environment verification
app.get('/', (req, res) => {
    res.send('🚀 Sparky API Relay is Active on Port 3002. Use /api/fetchPlaylist or /api/searchVideos.');
});

// Proxy-like behavior for Vercel functions
app.all('/api/fetchPlaylist', async (req, res) => {
    try {
        await fetchPlaylist(req, res);
    } catch (err) {
        console.error('[API Server] fetchPlaylist Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error', message: err.message });
        }
    }
});

app.all('/api/searchVideos', async (req, res) => {
    try {
        await searchVideos(req, res);
    } catch (err) {
        console.error('[API Server] searchVideos Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error', message: err.message });
        }
    }
});

app.listen(port, () => {
    console.log(`\n🚀 Local API Server running at http://localhost:${port}`);
    console.log(`📡 Endpoints:`);
    console.log(`   - http://localhost:${port}/api/fetchPlaylist`);
    console.log(`   - http://localhost:${port}/api/searchVideos`);
    console.log(`\n[Vite Integration] Proxied automatically via vite.config.js\n`);
});
