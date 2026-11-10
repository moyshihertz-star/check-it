const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || '1234';
const DB_FILE = path.join(__dirname, 'submissions.json');
const BACKUP_OBJECT_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a1c5d28bbb7ebb';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const BLOCKED_FILES = new Set([
    'server.js',
    'package.json',
    'package-lock.json',
    'render.yaml',
    'submissions.json'
]);

async function readLocalDb() {
    try {
        const raw = await fs.readFile(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function writeLocalDb(items) {
    await fs.writeFile(DB_FILE, JSON.stringify(items, null, 2), 'utf8');
}

async function syncFromBackupIfNeeded() {
    const localItems = await readLocalDb();
    try {
        const res = await fetch(BACKUP_OBJECT_URL, { cache: 'no-store' });
        if (res.ok) {
            const obj = await res.json();
            const remoteItems = Array.isArray(obj?.data?.items) ? obj.data.items : [];
            const byId = new Map();
            [...remoteItems, ...localItems].forEach((item) => {
                if (item && item.date) {
                    const key = item.id || `${item.food}-${item.date}-${item.time}-${item.submittedAt}`;
                    byId.set(key, item);
                }
            });
            const merged = Array.from(byId.values());
            await writeLocalDb(merged);
            return merged;
        }
    } catch {
        // Ignore network errors and use local DB file
    }
    return localItems;
}

async function saveToServerDb(submission) {
    const items = await syncFromBackupIfNeeded();
    items.push(submission);
    await writeLocalDb(items);

    try {
        await fetch(BACKUP_OBJECT_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'date-proposal-submissions',
                data: { items }
            })
        });
    } catch {
        // Local server DB already saved
    }

    return items;
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1e5) {
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // API: Save or Read Submissions on the Render server
    if (pathname === '/api/submissions') {
        if (req.method === 'POST') {
            try {
                const body = await readJsonBody(req);
                if (!body.date || !body.time) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Date and time are required' }));
                    return;
                }

                const submission = {
                    id: body.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
                    food: String(body.food || 'Surprise me').slice(0, 100),
                    date: String(body.date).slice(0, 40),
                    time: String(body.time).slice(0, 40),
                    submittedAt: new Date().toISOString()
                };

                await saveToServerDb(submission);
                res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, submission }));
                return;
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid request body' }));
                return;
            }
        }

        if (req.method === 'GET') {
            const providedCode = req.headers['x-admin-code'] || '';
            if (providedCode !== ADMIN_CODE) {
                res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            const items = await syncFromBackupIfNeeded();
            items.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            res.end(JSON.stringify({ submissions: items }));
            return;
        }

        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    // Serve static files
    let safePath = pathname === '/' ? '/index.html' : pathname;
    const fileName = path.basename(safePath);

    if (BLOCKED_FILES.has(fileName) || fileName.startsWith('.')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
    }

    const filePath = path.join(__dirname, safePath);
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    try {
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
    }
});

syncFromBackupIfNeeded().finally(() => {
    server.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`);
    });
});
