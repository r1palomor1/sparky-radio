import express from 'express';
import cors from 'cors';
import fetchPlaylist from './api/fetchPlaylist.js';
import searchVideos from './api/searchVideos.js';
import hydrateTags from './api/hydrateTags.js';

// Bulletproof crash protection to prevent InnerTube library parser crashes from killing the dev server
process.on('uncaughtException', (err) => {
    console.error('🔥 [BULLETPROOF] Uncaught Exception caught to prevent server crash:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [BULLETPROOF] Unhandled Rejection caught to prevent server crash:', reason);
});

const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

// Root route for environment verification
app.get('/', (req, res) => {
    res.send('🚀 Sparky API Relay is Active on Port 3002. Use /api/fetchPlaylist, /api/searchVideos, or /api/hydrateTags.');
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

app.all('/api/hydrateTags', async (req, res) => {
    try {
        await hydrateTags(req, res);
    } catch (err) {
        console.error('[API Server] hydrateTags Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error', message: err.message });
        }
    }
});

const server = app.listen(port, () => {
    console.log(`\n🚀 Local API Server running at http://localhost:${port}`);
    console.log(`📡 Endpoints:`);
    console.log(`   - http://localhost:${port}/api/fetchPlaylist`);
    console.log(`   - http://localhost:${port}/api/searchVideos`);
    console.log(`   - http://localhost:${port}/api/hydrateTags`);
    console.log(`\n[Vite Integration] Proxied automatically via vite.config.js\n`);
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`\n❌ ERROR: Port ${port} is already in use!`);
        console.error(`💡 SOLUTION: Run 'taskkill /f /im node.exe' and try again.\n`);
        process.exit(1);
    } else {
        console.error('\n❌ SERVER ERROR:', e);
    }
});
