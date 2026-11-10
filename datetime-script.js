document.addEventListener('DOMContentLoaded', () => {
    const datePicker = document.getElementById('date-picker');
    const timePicker = document.getElementById('time-picker');
    const submitBtn = document.getElementById('btn-submit-datetime');

    // Initialize Flatpickr to be an inline (always open) calendar
    flatpickr(datePicker, {
        inline: true,
        minDate: "today",
        defaultDate: "today" // Pre-selects today so there's always a blue mark
    });

    submitBtn.addEventListener('click', () => {
        const selectedDate = datePicker.value;
        const selectedTime = timePicker.value;
        
        if (!selectedDate || !selectedTime) {
            alert("Please pick both a date and a time!");
            return;
        }
        
        // If everything is valid
        alert(`Date locked in! 🥳 See you on ${selectedDate} at ${selectedTime}!`);
        // We can redirect to a final confirmation page if needed!
    });
});
