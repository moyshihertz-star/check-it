const ADMIN_CODE = '1234';
const STORAGE_OBJECT_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a1c5d28bbb7ebb';
const NTFY_POLL_URL = 'https://ntfy.sh/dp_store_9d1758e04c1a_live/json?poll=1&since=all';

async function fetchAllSubmissions(enteredCode) {
    const byId = new Map();

    const addItem = (item) => {
        if (!item || typeof item !== 'object' || !item.date) return;
        const key = item.id || `${item.food}-${item.date}-${item.time}-${item.submittedAt}`;
        byId.set(key, item);
    };

    // 1. Primary: Fetch from Render Node server (/api/submissions)
    try {
        const serverRes = await fetch('/api/submissions', {
            headers: { 'x-admin-code': enteredCode },
            cache: 'no-store'
        });
        if (serverRes.ok) {
            const data = await serverRes.json();
            if (Array.isArray(data.submissions)) {
                data.submissions.forEach(addItem);
            }
        }
    } catch {
        // Fall through to backups if running in static mode
    }

    // 2. Local fallback
    try {
        const local = JSON.parse(localStorage.getItem('date_submissions') || '[]');
        local.forEach(addItem);
    } catch {
        // Ignore
    }

    // 3. Persistent backup store
    try {
        const res = await fetch(STORAGE_OBJECT_URL, { cache: 'no-store' });
        if (res.ok) {
            const obj = await res.json();
            const items = Array.isArray(obj?.data?.items) ? obj.data.items : [];
            items.forEach(addItem);
        }
    } catch {
        // Ignore network errors
    }

    // 4. Real-time stream history
    try {
        const res = await fetch(NTFY_POLL_URL, { cache: 'no-store' });
        if (res.ok) {
            const text = await res.text();
            text.split('\n').filter(Boolean).forEach((line) => {
                try {
                    const evt = JSON.parse(line);
                    if (evt.event === 'message' && evt.message) {
                        const parsed = JSON.parse(evt.message);
                        addItem(parsed);
                    }
                } catch {
                    // Ignore malformed line
                }
            });
        }
    } catch {
        // Ignore network errors
    }

    return Array.from(byId.values()).sort((a, b) => {
        return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0);
    });
}

function renderSubmissions(listEl, submissions) {
    listEl.replaceChildren();

    if (submissions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'No date choices submitted yet.';
        listEl.appendChild(empty);
        return;
    }

    submissions.forEach((sub) => {
        const item = document.createElement('div');
        item.className = 'submission-card';

        const foodEl = document.createElement('div');
        foodEl.className = 'submission-food';
        foodEl.textContent = sub.food || 'Surprise me';

        const dateEl = document.createElement('div');
        dateEl.className = 'submission-datetime';
        dateEl.textContent = `📅 ${sub.date}   ⏰ ${sub.time}`;

        const metaEl = document.createElement('div');
        metaEl.className = 'submission-meta';
        const formattedTime = sub.submittedAt
            ? new Date(sub.submittedAt).toLocaleString()
            : '';
        metaEl.textContent = formattedTime ? `Submitted: ${formattedTime}` : '';

        item.append(foodEl, dateEl, metaEl);
        listEl.appendChild(item);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('admin-login-form');
    const codeInput = document.getElementById('admin-code');
    const errorEl = document.getElementById('code-error');
    const lockSection = document.getElementById('lock-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const listEl = document.getElementById('submissions-list');
    const refreshBtn = document.getElementById('btn-refresh');
    let activeCode = '';

    const loadDashboard = async () => {
        listEl.replaceChildren();
        const loading = document.createElement('p');
        loading.className = 'empty-state';
        loading.textContent = 'Loading responses...';
        listEl.appendChild(loading);

        const submissions = await fetchAllSubmissions(activeCode);
        renderSubmissions(listEl, submissions);
    };

    // Clear error state on input as soon as the user edits the field
    codeInput.addEventListener('input', () => {
        codeInput.removeAttribute('aria-invalid');
        errorEl.hidden = true;
        errorEl.textContent = '';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const entered = codeInput.value.trim();
        if (entered !== ADMIN_CODE) {
            codeInput.setAttribute('aria-invalid', 'true');
            errorEl.textContent = 'Incorrect secret code. Please try again.';
            errorEl.hidden = false;
            codeInput.focus();
            return;
        }

        activeCode = entered;
        lockSection.hidden = true;
        dashboardSection.hidden = false;
        await loadDashboard();
    });

    refreshBtn.addEventListener('click', loadDashboard);
});
