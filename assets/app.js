const dropZone = document.getElementById('dropZone');
const fileInputs = Array.from(document.querySelectorAll('input[type="file"][name^="frame"]'));
const hint = document.querySelector('.drop-zone-hint');
const previewGrid = document.getElementById('previewGrid');
const suggestedWidthText = document.getElementById('suggestedWidth');
const suggestedHeightText = document.getElementById('suggestedHeight');
const maxWidthText = document.getElementById('maxWidth');
const maxHeightText = document.getElementById('maxHeight');
const frameWidthInput = document.querySelector('input[name="frame_width"]');
const frameHeightInput = document.querySelector('input[name="frame_height"]');
const frameRateInput = document.querySelector('input[name="frame_rate"]');

function updateHint(message) {
    if (!hint) return;
    hint.textContent = message || 'Drag & drop up to 5 images here or paste them from the clipboard.';
}

function handleFiles(files) {
    if (!files || !files.length || fileInputs.length === 0) return;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, 5);
    if (imageFiles.length === 0) return;

    const emptyInputs = fileInputs.filter((input) => !input.files.length);
    imageFiles.forEach((file, index) => {
        const targetInput = emptyInputs[index] || fileInputs[index];
        const dt = new DataTransfer();
        dt.items.add(file);
        targetInput.files = dt.files;
    });

    updateHint(`${imageFiles.length} image(s) selected`);
    updateSelectedPreviews();
}

function updateSelectedPreviews() {
    if (!previewGrid) return;
    previewGrid.innerHTML = '';

    const selectedFiles = fileInputs.map((input) => input.files[0]).filter(Boolean);
    if (selectedFiles.length === 0) {
        previewGrid.innerHTML = '<div class="preview-placeholder">Select images to preview removed background here.</div>';
        suggestedWidthText.textContent = '32';
        suggestedHeightText.textContent = '32';
        maxWidthText.textContent = '32';
        maxHeightText.textContent = '32';
        return;
    }

    const dimensionPromises = selectedFiles.map((file, index) => {
        return loadImage(file).then((img) => {
            const card = createPreviewCard(img, index + 1, file.name);
            previewGrid.appendChild(card);
            return { width: img.naturalWidth, height: img.naturalHeight };
        }).catch(() => {
            const card = document.createElement('div');
            card.className = 'frame-card';
            card.innerHTML = '<div class="preview-placeholder-small">Unable to preview</div>';
            previewGrid.appendChild(card);
            return null;
        });
    });

    Promise.all(dimensionPromises).then((results) => {
        const sizes = results.filter(Boolean);
        if (sizes.length > 0) {
            updateSuggestedSizes(sizes);
        }
    });
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Image load error'));
        };

        img.src = url;
    });
}

function createPreviewCard(img, index, name) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bgColor = estimateBackgroundColor(imageData);
    const tolerance = 45;

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

    const card = document.createElement('div');
    card.className = 'frame-card';
    card.innerHTML = `
        <div class="frame-card-label">Frame ${index}</div>
        <img src="${canvas.toDataURL('image/png')}" alt="Frame ${index} preview">
        <div class="frame-card-meta">${name} (${img.naturalWidth}×${img.naturalHeight})</div>
    `;
    return card;
}

function updateSuggestedSizes(sizes) {
    const maxWidth = Math.max(...sizes.map((item) => item.width));
    const maxHeight = Math.max(...sizes.map((item) => item.height));

    if (suggestedWidthText) suggestedWidthText.textContent = `${maxWidth}`;
    if (suggestedHeightText) suggestedHeightText.textContent = `${maxHeight}`;
    if (maxWidthText) maxWidthText.textContent = `${maxWidth}`;
    if (maxHeightText) maxHeightText.textContent = `${maxHeight}`;
    if (frameWidthInput && !frameWidthInput.value) frameWidthInput.value = `${maxWidth}`;
    if (frameHeightInput && !frameHeightInput.value) frameHeightInput.value = `${maxHeight}`;
    if (frameRateInput && !frameRateInput.value) frameRateInput.value = '24';
}

function estimateBackgroundColor(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const samples = [];
    const step = Math.max(1, Math.floor(Math.min(width, height) / 8));

    for (let x = 0; x < width; x += step) {
        samples.push(getPixel(imageData, x, 0));
        samples.push(getPixel(imageData, x, height - 1));
    }

    for (let y = 0; y < height; y += step) {
        samples.push(getPixel(imageData, 0, y));
        samples.push(getPixel(imageData, width - 1, y));
    }

    const average = samples.reduce((acc, pixel) => ({
        r: acc.r + pixel.r,
        g: acc.g + pixel.g,
        b: acc.b + pixel.b
    }), { r: 0, g: 0, b: 0 });

    return {
        r: Math.round(average.r / samples.length),
        g: Math.round(average.g / samples.length),
        b: Math.round(average.b / samples.length)
    };
}

function getPixel(imageData, x, y) {
    const idx = (y * imageData.width + x) * 4;
    return {
        r: imageData.data[idx],
        g: imageData.data[idx + 1],
        b: imageData.data[idx + 2]
    };
}

function isSimilarColor(r, g, b, target, tolerance) {
    return (
        Math.abs(r - target.r) <= tolerance &&
        Math.abs(g - target.g) <= tolerance &&
        Math.abs(b - target.b) <= tolerance
    );
}

if (fileInputs.length) {
    fileInputs.forEach((input) => {
        input.addEventListener('change', updateSelectedPreviews);
    });
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

document.addEventListener('paste', (event) => {
    const files = event.clipboardData && event.clipboardData.files;
    if (files && files.length > 0) {
        handleFiles(files);
        event.preventDefault();
    }
});

updateSelectedPreviews();
