const STORAGE_OBJECT_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a1c5d28bbb7ebb';
const NTFY_TOPIC_URL = 'https://ntfy.sh/dp_store_9d1758e04c1a_live';

async function saveSubmission(submission) {
    // 1. Save locally as backup
    try {
        const local = JSON.parse(localStorage.getItem('date_submissions') || '[]');
        local.push(submission);
        localStorage.setItem('date_submissions', JSON.stringify(local));
    } catch {
        // Ignore storage errors
    }

    // 2. Save directly to the Render Node backend (/api/submissions)
    try {
        const serverRes = await fetch('/api/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submission)
        });
        if (serverRes.ok) {
            return;
        }
    } catch {
        // Fall through if running in static-only mode
    }

    // 3. Fallback sync if opened via static site
    const cloudUpdate = (async () => {
        const res = await fetch(STORAGE_OBJECT_URL, { cache: 'no-store' });
        const obj = await res.json();
        const existing = Array.isArray(obj?.data?.items) ? obj.data.items : [];
        existing.push(submission);
        await fetch(STORAGE_OBJECT_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'date-proposal-submissions',
                data: { items: existing }
            })
        });
    })();

    const ntfyUpdate = fetch(NTFY_TOPIC_URL, {
        method: 'POST',
        body: JSON.stringify(submission)
    });

    await Promise.allSettled([cloudUpdate, ntfyUpdate]);
}

document.addEventListener('DOMContentLoaded', () => {
    const datePicker = document.getElementById('date-picker');
    const timePicker = document.getElementById('time-picker');
    const submitBtn = document.getElementById('btn-submit-datetime');
    const params = new URLSearchParams(window.location.search);
    const selectedFood = params.get('food') || localStorage.getItem('selectedFood') || 'Surprise me';

    // Initialize Flatpickr to be an inline (always open) calendar
    flatpickr(datePicker, {
        inline: true,
        minDate: "today",
        defaultDate: "today"
    });

    submitBtn.addEventListener('click', async () => {
        const selectedDate = datePicker.value;
        const selectedTime = timePicker.value;
        const selectedTimeLabel = timePicker.options[timePicker.selectedIndex]?.text || selectedTime;
        
        if (!selectedDate || !selectedTime) {
            alert("Please pick both a date and a time!");
            return;
        }

        // Disable submit button after valid click to prevent double-posts
        submitBtn.disabled = true;
        submitBtn.textContent = 'Locking in...';

        const submission = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            food: selectedFood,
            date: selectedDate,
            time: selectedTimeLabel,
            submittedAt: new Date().toISOString()
        };

        await saveSubmission(submission);

        const card = document.querySelector('.glass-card');
        card.replaceChildren();

        const heading = document.createElement('h1');
        heading.className = 'question-text';
        heading.textContent = "It's a date! 🥳";

        const details = document.createElement('p');
        details.className = 'confirmation-summary';
        details.textContent = `${selectedFood} on ${selectedDate} at ${selectedTimeLabel}`;

        card.append(heading, details);
    });
});
