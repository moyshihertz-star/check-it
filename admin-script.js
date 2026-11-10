const ADMIN_CODE = '1234';
const STORAGE_OBJECT_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a1c5d28bbb7ebb';
const NTFY_POLL_URL = 'https://ntfy.sh/dp_store_9d1758e04c1a_live/json?poll=1&since=all';

function getSubmissionKey(item) {
    return item.id || `${item.food}-${item.date}-${item.time}-${item.submittedAt}`;
}

async function fetchAllSubmissions(enteredCode) {
    const byId = new Map();
    const deletedSet = new Set();

    try {
        const localDeleted = JSON.parse(localStorage.getItem('deleted_submission_ids') || '[]');
        localDeleted.forEach((id) => deletedSet.add(id));
    } catch {
        // Ignore
    }

    const addItem = (item) => {
        if (!item || typeof item !== 'object' || !item.date) return;
        const key = getSubmissionKey(item);
        if (deletedSet.has(key)) return;
        byId.set(key, { ...item, id: key });
    };

    // 1. Primary: Fetch from Render Node server (/api/submissions)
    try {
        const serverRes = await fetch('/api/submissions', {
            headers: { 'x-admin-code': enteredCode },
            cache: 'no-store'
        });
        if (serverRes.ok) {
            const data = await serverRes.json();
            if (Array.isArray(data.deletedIds)) {
                data.deletedIds.forEach((id) => deletedSet.add(id));
            }
            if (Array.isArray(data.submissions)) {
                data.submissions.forEach(addItem);
            }
        }
    } catch {
        // Fall through to backups if running in static mode
    }

    // 2. Persistent backup store
    try {
        const res = await fetch(STORAGE_OBJECT_URL, { cache: 'no-store' });
        if (res.ok) {
            const obj = await res.json();
            const remoteDeleted = Array.isArray(obj?.data?.deletedIds) ? obj.data.deletedIds : [];
            remoteDeleted.forEach((id) => {
                deletedSet.add(id);
                byId.delete(id);
            });
            const items = Array.isArray(obj?.data?.items) ? obj.data.items : [];
            items.forEach(addItem);
        }
    } catch {
        // Ignore network errors
    }

    // 3. Local fallback
    try {
        const local = JSON.parse(localStorage.getItem('date_submissions') || '[]');
        local.forEach(addItem);
    } catch {
        // Ignore
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

async function deleteSubmission(targetId, enteredCode) {
    // 1. Update local storage immediately
    try {
        const localDeleted = JSON.parse(localStorage.getItem('deleted_submission_ids') || '[]');
        if (!localDeleted.includes(targetId)) {
            localDeleted.push(targetId);
            localStorage.setItem('deleted_submission_ids', JSON.stringify(localDeleted));
        }
        const localItems = JSON.parse(localStorage.getItem('date_submissions') || '[]');
        const filteredLocal = localItems.filter((item) => getSubmissionKey(item) !== targetId);
        localStorage.setItem('date_submissions', JSON.stringify(filteredLocal));
    } catch {
        // Ignore
    }

    // 2. Delete from Render Node server (/api/submissions)
    try {
        const serverRes = await fetch(`/api/submissions?id=${encodeURIComponent(targetId)}`, {
            method: 'DELETE',
            headers: { 'x-admin-code': enteredCode }
        });
        if (serverRes.ok) {
            return;
        }
    } catch {
        // Fall through if running in static mode
    }

    // 3. Fallback: Delete from persistent backup store directly
    try {
        const res = await fetch(STORAGE_OBJECT_URL, { cache: 'no-store' });
        if (res.ok) {
            const obj = await res.json();
            const existingItems = Array.isArray(obj?.data?.items) ? obj.data.items : [];
            const existingDeleted = Array.isArray(obj?.data?.deletedIds) ? obj.data.deletedIds : [];
            const deletedSet = new Set([...existingDeleted, targetId]);
            const remainingItems = existingItems.filter((item) => getSubmissionKey(item) !== targetId);

            await fetch(STORAGE_OBJECT_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'date-proposal-submissions',
                    data: {
                        items: remainingItems,
                        deletedIds: Array.from(deletedSet)
                    }
                })
            });
        }
    } catch {
        // Ignore network errors
    }
}

function renderSubmissions(listEl, submissions, onDelete) {
    listEl.replaceChildren();

    if (submissions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'No date choices submitted yet.';
        listEl.appendChild(empty);
        return;
    }

    submissions.forEach((sub) => {
        const key = getSubmissionKey(sub);
        const item = document.createElement('div');
        item.className = 'submission-card';

        const infoContainer = document.createElement('div');
        infoContainer.className = 'submission-info';

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

        infoContainer.append(foodEl, dateEl, metaEl);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-delete-sub';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
            await onDelete(key);
        });

        item.append(infoContainer, deleteBtn);
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
        renderSubmissions(listEl, submissions, async (targetId) => {
            await deleteSubmission(targetId, activeCode);
            await loadDashboard();
        });
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
