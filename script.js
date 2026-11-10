document.addEventListener('DOMContentLoaded', () => {
    const btnYes = document.getElementById('btn-yes');
    const btnNo = document.getElementById('btn-no');

    btnYes.addEventListener('click', () => {
        window.location.href = 'food.html';
    });

    const moveNoButton = () => {
        // Because the glass card has an animation with "transform", it acts as a containing block.
        // We move the button to the document body so it can be positioned exactly anywhere on the screen!
        if (btnNo.parentElement !== document.body) {
            document.body.appendChild(btnNo);
            btnNo.style.position = 'absolute';
            btnNo.style.zIndex = '9999';
        }
        
        const padding = 20; 
        const btnWidth = btnNo.offsetWidth;
        const btnHeight = btnNo.offsetHeight;
        
        // Calculate the maximum X and Y coordinates relative to the full window
        const maxX = window.innerWidth - btnWidth - padding;
        const maxY = window.innerHeight - btnHeight - padding;
        
        // Generate random coordinates
        const randomX = Math.max(padding, Math.floor(Math.random() * maxX));
        const randomY = Math.max(padding, Math.floor(Math.random() * maxY));
        
        // Apply the new position
        btnNo.style.left = `${randomX}px`;
        btnNo.style.top = `${randomY}px`;
        
        // Remove hover transforms from CSS that might interfere
        btnNo.style.transform = 'none';
    };

    // Move away on hover
    btnNo.addEventListener('mouseover', moveNoButton);
    
    // Move away on touch for mobile
    btnNo.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        moveNoButton();
    });

    btnNo.addEventListener('click', (e) => {
        e.preventDefault();
        moveNoButton();
    });
});
