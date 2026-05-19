const dropZone = document.getElementById('dropZone');
const framesContainer = document.getElementById('framesContainer');
const addFrameButton = document.getElementById('addFrameButton');
const hint = document.querySelector('.drop-zone-hint');
const previewGrid = document.getElementById('previewGrid');
const suggestedWidthText = document.getElementById('suggestedWidth');
const suggestedHeightText = document.getElementById('suggestedHeight');
const maxWidthText = document.getElementById('maxWidth');
const maxHeightText = document.getElementById('maxHeight');
const frameWidthInput = document.querySelector('input[name="frame_width"]');
const frameHeightInput = document.querySelector('input[name="frame_height"]');
const frameDelayInput = document.querySelector('input[name="delay_ms"]');
const MAX_FRAMES = 12;

function getFileInputs() {
    return Array.from(framesContainer.querySelectorAll('input.frame-input'));
}

function getFrameCount() {
    return getFileInputs().length;
}

function updateFrameLabels() {
    getFileInputs().forEach((input, index) => {
        const label = input.closest('.upload-field');
        if (label) {
            const title = label.querySelector('span');
            title.textContent = `Frame ${index + 1}`;
            const preview = label.querySelector('.frame-preview-card');
            if (preview) {
                preview.id = `framePreview${index + 1}`;
            }
        }
    });
}

function createFrameInput() {
    const wrapper = document.createElement('label');
    wrapper.className = 'field upload-field';
    const index = getFrameCount() + 1;

    wrapper.innerHTML = `
        <span>Frame ${index}</span>
        <input type="file" name="frames[]" class="frame-input" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif">
        <div class="frame-preview-card" id="framePreview${index}">
            <div class="preview-placeholder-small">No image selected</div>
        </div>
    `;

    const input = wrapper.querySelector('input.frame-input');
    input.addEventListener('change', updateSelectedPreviews);
    return wrapper;
}

function updateHint(message) {
    if (!hint) return;
    hint.textContent = message || `Drag & drop 2 to ${MAX_FRAMES} images here or paste them from the clipboard.`;
}

function handleFiles(files) {
    if (!files || !files.length || !framesContainer) return;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, MAX_FRAMES);
    if (imageFiles.length === 0) return;

    while (getFrameCount() < imageFiles.length && getFrameCount() < MAX_FRAMES) {
        framesContainer.appendChild(createFrameInput());
    }

    const fileInputs = getFileInputs();
    imageFiles.forEach((file, index) => {
        const input = fileInputs[index];
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
    });

    updateHint(`${imageFiles.length} image(s) selected`);
    updateSelectedPreviews();
}

function updateSelectedPreviews() {
    if (!previewGrid) return;
    previewGrid.innerHTML = '';

    const selectedFiles = getFileInputs().map((input) => input.files[0]).filter(Boolean);
    if (selectedFiles.length < 2) {
        previewGrid.innerHTML = '<div class="preview-placeholder">Select at least 2 frames to preview and convert.</div>';
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
    if (frameDelayInput && !frameDelayInput.value) frameDelayInput.value = '120';
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

function initializeFrameInputs() {
    getFileInputs().forEach((input) => {
        input.addEventListener('change', updateSelectedPreviews);
    });
}

if (addFrameButton) {
    addFrameButton.addEventListener('click', () => {
        if (getFrameCount() >= MAX_FRAMES) return;
        framesContainer.appendChild(createFrameInput());
        updateFrameLabels();
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

function setUploadMode(mode) {
    const spriteUploadSection = document.getElementById('spriteUploadSection');
    const framesUploadSection = document.getElementById('framesUploadSection');
    const sliceControls = document.getElementById('sliceControls');
    const spriteInput = document.getElementById('spriteInput');
    const sliceEnabledInput = document.getElementById('sliceEnabledInput');
    const frameInputs = getFileInputs();

    if (spriteUploadSection) {
        spriteUploadSection.classList.toggle('is-hidden', mode === 'frames');
    }

    if (framesUploadSection) {
        framesUploadSection.classList.toggle('is-hidden', mode !== 'frames');
    }

    if (sliceControls) {
        sliceControls.classList.toggle('is-hidden', mode !== 'sprite_sheet');
    }

    if (spriteInput) {
        spriteInput.required = mode !== 'frames';
    }

    frameInputs.forEach((input) => {
        input.required = mode === 'frames';
    });

    if (sliceEnabledInput) {
        sliceEnabledInput.value = mode === 'sprite_sheet' ? '1' : '0';
    }
}

const uploadModeInputs = document.querySelectorAll('input[name="upload_mode"]');
if (uploadModeInputs.length) {
    uploadModeInputs.forEach((input) => {
        input.addEventListener('change', () => setUploadMode(input.value));
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setUploadMode('single'));
} else {
    setUploadMode('single');
}

document.addEventListener('paste', (event) => {
    const files = event.clipboardData && event.clipboardData.files;
    if (files && files.length > 0) {
        handleFiles(files);
        event.preventDefault();
    }
});

initializeFrameInputs();
updateSelectedPreviews();

