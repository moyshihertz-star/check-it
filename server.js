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

function getSubmissionKey(item) {
    return item.id || `${item.food}-${item.date}-${item.time}-${item.submittedAt}`;
}

async function readLocalDb() {
    try {
        const raw = await fs.readFile(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return { items: parsed, deletedIds: [] };
        }
        return {
            items: Array.isArray(parsed?.items) ? parsed.items : [],
            deletedIds: Array.isArray(parsed?.deletedIds) ? parsed.deletedIds : []
        };
    } catch {
        return { items: [], deletedIds: [] };
    }
}

async function writeLocalDb(state) {
    await fs.writeFile(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function syncStateWithBackup() {
    const localState = await readLocalDb();
    try {
        const res = await fetch(BACKUP_OBJECT_URL, { cache: 'no-store' });
        if (res.ok) {
            const obj = await res.json();
            const remoteItems = Array.isArray(obj?.data?.items) ? obj.data.items : [];
            const remoteDeleted = Array.isArray(obj?.data?.deletedIds) ? obj.data.deletedIds : [];

            const deletedSet = new Set([...localState.deletedIds, ...remoteDeleted]);
            const byId = new Map();
            [...remoteItems, ...localState.items].forEach((item) => {
                if (item && item.date) {
                    const key = getSubmissionKey(item);
                    if (!deletedSet.has(key)) {
                        byId.set(key, { ...item, id: key });
                    }
                }
            });

            const mergedState = {
                items: Array.from(byId.values()),
                deletedIds: Array.from(deletedSet)
            };
            await writeLocalDb(mergedState);
            return mergedState;
        }
    } catch {
        // Ignore network errors and use local DB file
    }
    return localState;
}

async function pushStateToBackup(state) {
    try {
        await fetch(BACKUP_OBJECT_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'date-proposal-submissions',
                data: state
            })
        });
    } catch {
        // Local server DB already saved
    }
}

async function saveToServerDb(submission) {
    const state = await syncStateWithBackup();
    state.items.push(submission);
    await writeLocalDb(state);
    await pushStateToBackup(state);
    return state.items;
}

async function deleteFromServerDb(targetId) {
    const state = await syncStateWithBackup();
    const deletedSet = new Set(state.deletedIds);
    deletedSet.add(targetId);

    const nextState = {
        items: state.items.filter((item) => getSubmissionKey(item) !== targetId),
        deletedIds: Array.from(deletedSet)
    };

    await writeLocalDb(nextState);
    await pushStateToBackup(nextState);
    return nextState.items;
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

    // API: Save, Read, or Delete Submissions on the Render server
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
            } catch {
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

            const state = await syncStateWithBackup();
            const items = [...state.items].sort(
                (a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
            );
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            res.end(JSON.stringify({ submissions: items, deletedIds: state.deletedIds }));
            return;
        }

        if (req.method === 'DELETE') {
            const providedCode = req.headers['x-admin-code'] || '';
            if (providedCode !== ADMIN_CODE) {
                res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            const targetId = parsedUrl.searchParams.get('id');
            if (!targetId) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Missing submission id' }));
                return;
            }

            const remaining = await deleteFromServerDb(targetId);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, submissions: remaining }));
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

syncStateWithBackup().finally(() => {
    server.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`);
    });
});
