document.addEventListener('DOMContentLoaded', () => {
    const foodItems = document.querySelectorAll('.food-item');
    const submitBtn = document.getElementById('btn-submit-food');
    let selectedFood = null;

    foodItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove selection from all others
            foodItems.forEach(f => {
                f.style.background = '';
                f.style.color = 'var(--text-main)';
            });
            
            // Highlight selected
            item.style.background = 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))';
            item.style.color = 'white';
            
            selectedFood = item.textContent;
            
            // Show the submit button
            submitBtn.style.display = 'inline-block';
        });
    });

    submitBtn.addEventListener('click', () => {
        if (selectedFood) {
            window.location.href = 'datetime.html';
        }
    });
});
