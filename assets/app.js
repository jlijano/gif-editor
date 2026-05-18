const checkbox = document.getElementById('sliceEnabled');
const controls = document.getElementById('sliceControls');

function syncControls() {
    if (!checkbox || !controls) return;
    controls.classList.toggle('is-hidden', !checkbox.checked);
}

if (checkbox) {
    checkbox.addEventListener('change', syncControls);
    syncControls();
}
