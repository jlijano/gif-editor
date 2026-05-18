const checkbox = document.getElementById('sliceEnabled');
const controls = document.getElementById('sliceControls');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('spriteInput');
const hint = document.querySelector('.drop-zone-hint');
const previewImage = document.getElementById('uploadPreview');
const previewPlaceholder = document.querySelector('.preview-placeholder');

function syncControls() {
    if (!checkbox || !controls) return;
    controls.classList.toggle('is-hidden', !checkbox.checked);
}

function updateHint(message) {
    if (!hint) return;
    hint.textContent = message || 'Upload, drag & drop, or paste an image here.';
}

function setPreview(imageUrl) {
    if (!previewImage || !previewPlaceholder) return;
    previewImage.src = imageUrl;
    previewImage.hidden = false;
    previewPlaceholder.style.display = 'none';
}

function clearPreview() {
    if (!previewImage || !previewPlaceholder) return;
    previewImage.src = '';
    previewImage.hidden = true;
    previewPlaceholder.style.display = 'block';
}

function handleFiles(files) {
    if (!files || files.length === 0 || !fileInput) return;
    const dt = new DataTransfer();
    dt.items.add(files[0]);
    fileInput.files = dt.files;
    updateHint(files[0].name);
    loadPreview(files[0]);
}

function loadPreview(file) {
    if (!file || !file.type.startsWith('image/')) {
        clearPreview();
        return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
        URL.revokeObjectURL(url);
        renderPreview(img);
    };

    img.onerror = () => {
        URL.revokeObjectURL(url);
        clearPreview();
    };

    img.src = url;
}

function renderPreview(img) {
    const canvas = document.createElement('canvas');
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const bgColor = estimateBackgroundColor(imageData);
    const tolerance = 35;

    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const a = imageData.data[i + 3];

        if (a > 0 && isSimilarColor(r, g, b, bgColor, tolerance)) {
            imageData.data[i + 3] = 0;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    setPreview(canvas.toDataURL('image/png'));
}

function estimateBackgroundColor(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const samples = [];
    const corners = [
        { x: 0, y: 0 },
        { x: width - 1, y: 0 },
        { x: 0, y: height - 1 },
        { x: width - 1, y: height - 1 }
    ];

    for (const corner of corners) {
        const idx = (corner.y * width + corner.x) * 4;
        samples.push({
            r: imageData.data[idx],
            g: imageData.data[idx + 1],
            b: imageData.data[idx + 2]
        });
    }

    const average = samples.reduce((acc, item) => ({
        r: acc.r + item.r,
        g: acc.g + item.g,
        b: acc.b + item.b
    }), { r: 0, g: 0, b: 0 });

    return {
        r: Math.round(average.r / samples.length),
        g: Math.round(average.g / samples.length),
        b: Math.round(average.b / samples.length)
    };
}

function isSimilarColor(r, g, b, target, tolerance) {
    return (
        Math.abs(r - target.r) <= tolerance &&
        Math.abs(g - target.g) <= tolerance &&
        Math.abs(b - target.b) <= tolerance
    );
}

if (dropZone) {
    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(event.dataTransfer.files);
    });
}

if (document) {
    document.addEventListener('paste', (event) => {
        const files = event.clipboardData && event.clipboardData.files;
        if (files && files.length > 0) {
            handleFiles(files);
            event.preventDefault();
        }
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (event) => {
        handleFiles(event.target.files);
    });
}

if (checkbox) {
    checkbox.addEventListener('change', syncControls);
    syncControls();
}
