const dropZone = document.getElementById('dropZone');
const framesContainer = document.getElementById('framesContainer');
const addFrameButton = document.getElementById('addFrameButton');
const spliceFrameButton = document.getElementById('spliceFrameButton');
const spliceNotice = document.getElementById('spliceNotice');
const hint = document.querySelector('.drop-zone-hint');
const previewGrid = document.getElementById('previewGrid');
const suggestedWidthText = document.getElementById('suggestedWidth');
const suggestedHeightText = document.getElementById('suggestedHeight');
const maxWidthText = document.getElementById('maxWidth');
const maxHeightText = document.getElementById('maxHeight');
const frameWidthInput = document.querySelector('input[name="frame_width"]');
const frameHeightInput = document.querySelector('input[name="frame_height"]');
const frameDelayInput = document.querySelector('input[name="delay_ms"]');
const frameCountInput = document.querySelector('input[name="frame_count"]');
const directionSelect = document.querySelector('select[name="direction"]');
const spriteHintBox = document.getElementById('spriteHintBox');
const spriteInput = document.getElementById('spriteInput');
const uploadModeInputs = document.querySelectorAll('input[name="upload_mode"]');
const MAX_FRAMES = 12;

let pendingSplice = null;
let lastChangedFrameInput = null;
let previewUpdateId = 0;

function getFileInputs() {
    if (!framesContainer) return [];
    return Array.from(framesContainer.querySelectorAll('input.frame-input'));
}

function getFrameCount() {
    return getFileInputs().length;
}

function getFrameFieldName() {
    const firstInput = getFileInputs()[0];
    return firstInput && firstInput.name ? firstInput.name : 'frames';
}

function getPositiveInteger(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function wasUserEdited(input) {
    return Boolean(input && input.dataset.userEdited === 'true');
}

function markUserEdited(input) {
    if (!input) return;
    input.addEventListener('input', () => {
        input.dataset.userEdited = 'true';
        if (getFileInputs().some((fileInput) => fileInput.files && fileInput.files[0])) {
            updateSelectedPreviews();
        }
    });
}

function setDimensionValue(input, value, userAccepted = false) {
    if (!input || !value) return;
    input.value = `${value}`;
    if (userAccepted) {
        input.dataset.userEdited = 'true';
    }
}

function escapeHtml(value) {
    return `${value}`
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function updateFrameLabels() {
    getFileInputs().forEach((input, index) => {
        const label = input.closest('.upload-field');
        if (!label) return;

        const title = label.querySelector('span');
        if (title) {
            title.textContent = `Frame ${index + 1}`;
        }

        const preview = label.querySelector('.frame-preview-card');
        if (preview) {
            preview.id = `framePreview${index + 1}`;
        }
    });
}

function bindFrameInput(input) {
    if (!input || input.dataset.boundPreview === 'true') return;

    input.addEventListener('change', (event) => {
        lastChangedFrameInput = event.currentTarget;
        updateSelectedPreviews();
    });
    input.dataset.boundPreview = 'true';
}

function createFrameInput() {
    const wrapper = document.createElement('label');
    wrapper.className = 'field upload-field';
    const index = getFrameCount() + 1;
    const fieldName = escapeHtml(getFrameFieldName());

    wrapper.innerHTML = `
        <span>Frame ${index}</span>
        <input type="file" name="${fieldName}" class="frame-input" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif">
        <div class="frame-preview-card" id="framePreview${index}">
            <div class="preview-placeholder-small">No image selected</div>
        </div>
    `;

    bindFrameInput(wrapper.querySelector('input.frame-input'));
    return wrapper;
}

function updateHint(message) {
    if (!hint) return;
    hint.textContent = message || `Drag & drop 2 to ${MAX_FRAMES} images here or paste them from the clipboard.`;
}

function setInputFile(input, file) {
    if (!input || !file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
}

function clearInputFile(input) {
    if (!input) return;
    input.value = '';
}

function ensureFrameSlots(count) {
    if (!framesContainer) return;
    while (getFrameCount() < count && getFrameCount() < MAX_FRAMES) {
        framesContainer.appendChild(createFrameInput());
    }
    updateFrameLabels();
}

function handleFiles(files) {
    if (!files || !files.length || !framesContainer) return;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, MAX_FRAMES);
    if (imageFiles.length === 0) return;

    ensureFrameSlots(imageFiles.length);
    getFileInputs().forEach(clearInputFile);

    const fileInputs = getFileInputs();
    imageFiles.forEach((file, index) => {
        setInputFile(fileInputs[index], file);
    });

    lastChangedFrameInput = fileInputs[0] || null;
    updateHint(`${imageFiles.length} image(s) selected`);
    updateSelectedPreviews();
}

function renderFrameUploadPreview(input, file, img) {
    const preview = input && input.closest('.upload-field') && input.closest('.upload-field').querySelector('.frame-preview-card');
    if (!preview) return;

    if (!file || !img) {
        preview.innerHTML = '<div class="preview-placeholder-small">No image selected</div>';
        return;
    }

    const canvas = createCleanCanvas(img);
    preview.innerHTML = `
        <div>
            <img src="${canvas.toDataURL('image/png')}" alt="${escapeHtml(file.name)} preview">
            <div class="frame-preview-meta">${escapeHtml(file.name)}<br>${img.naturalWidth}x${img.naturalHeight}</div>
        </div>
    `;
}

function resetSuggestedSizes() {
    if (suggestedWidthText) suggestedWidthText.textContent = '32';
    if (suggestedHeightText) suggestedHeightText.textContent = '32';
    if (maxWidthText) maxWidthText.textContent = '32';
    if (maxHeightText) maxHeightText.textContent = '32';
    if (frameWidthInput && !wasUserEdited(frameWidthInput)) frameWidthInput.value = '32';
    if (frameHeightInput && !wasUserEdited(frameHeightInput)) frameHeightInput.value = '32';
}

async function updateSelectedPreviews() {
    const updateId = ++previewUpdateId;
    const inputs = getFileInputs();
    const selectedItems = inputs
        .map((input, index) => ({ input, index, file: input.files && input.files[0] }))
        .filter((item) => Boolean(item.file));

    inputs.forEach((input) => {
        if (!input.files || !input.files[0]) {
            renderFrameUploadPreview(input, null, null);
        }
    });

    if (previewGrid) {
        previewGrid.innerHTML = '';
    }

    if (selectedItems.length === 0) {
        if (previewGrid) {
            previewGrid.innerHTML = '<div class="preview-placeholder">Select at least 2 frames to preview and convert.</div>';
        }
        resetSuggestedSizes();
        clearSpliceSuggestion();
        return;
    }

    if (previewGrid && selectedItems.length < 2) {
        previewGrid.innerHTML = '<div class="preview-placeholder">Select at least 2 frames to preview and convert.</div>';
    }

    const loadedItems = await Promise.all(selectedItems.map(async (item) => {
        try {
            const img = await loadImage(item.file);
            return {
                ...item,
                img,
                width: img.naturalWidth,
                height: img.naturalHeight
            };
        } catch {
            return { ...item, error: true };
        }
    }));

    if (updateId !== previewUpdateId) return;

    loadedItems.forEach((item) => {
        if (item.error) {
            renderUnableToPreview(item.input);
            if (previewGrid && selectedItems.length >= 2) {
                const card = document.createElement('div');
                card.className = 'frame-card';
                card.innerHTML = '<div class="preview-placeholder-small">Unable to preview</div>';
                previewGrid.appendChild(card);
            }
            return;
        }

        renderFrameUploadPreview(item.input, item.file, item.img);
        if (previewGrid && selectedItems.length >= 2) {
            previewGrid.appendChild(createPreviewCard(item.img, item.index + 1, item.file.name));
        }
    });

    const sizes = loadedItems.filter((item) => !item.error).map((item) => ({
        width: item.width,
        height: item.height
    }));

    if (sizes.length > 0) {
        updateSuggestedSizes(sizes);
    }

    updateFrameSpliceSuggestion(loadedItems.filter((item) => !item.error));
}

function renderUnableToPreview(input) {
    const preview = input && input.closest('.upload-field') && input.closest('.upload-field').querySelector('.frame-preview-card');
    if (preview) {
        preview.innerHTML = '<div class="preview-placeholder-small">Unable to preview</div>';
    }
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

function createCleanCanvas(img) {
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
    return canvas;
}

function createPreviewCard(img, index, name) {
    const canvas = createCleanCanvas(img);
    const card = document.createElement('div');
    card.className = 'frame-card';
    card.innerHTML = `
        <div class="frame-card-label">Frame ${index}</div>
        <img src="${canvas.toDataURL('image/png')}" alt="Frame ${index} preview">
        <div class="frame-card-meta">${escapeHtml(name)} (${img.naturalWidth}x${img.naturalHeight})</div>
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
    if (frameWidthInput && !wasUserEdited(frameWidthInput)) frameWidthInput.value = `${maxWidth}`;
    if (frameHeightInput && !wasUserEdited(frameHeightInput)) frameHeightInput.value = `${maxHeight}`;
    if (frameDelayInput && !frameDelayInput.value) frameDelayInput.value = '120';
}

function inferFrameLength(totalLength, crossLength) {
    if (crossLength > 0 && totalLength % crossLength === 0) {
        return crossLength;
    }

    const estimatedCount = Math.max(2, Math.round(totalLength / Math.max(1, crossLength)));
    return Math.max(1, Math.floor(totalLength / estimatedCount));
}

function analyzeSpriteStrip(img, file, input = null, index = 0) {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const isHorizontalSheet = width >= height * 2;
    const isVerticalSheet = height >= width * 2;

    if (!isHorizontalSheet && !isVerticalSheet) {
        return null;
    }

    const direction = isVerticalSheet && height / width >= width / height ? 'vertical' : 'horizontal';
    const userWidth = wasUserEdited(frameWidthInput) ? getPositiveInteger(frameWidthInput.value) : 0;
    const userHeight = wasUserEdited(frameHeightInput) ? getPositiveInteger(frameHeightInput.value) : 0;

    let frameWidth;
    let frameHeight;

    if (direction === 'vertical') {
        frameWidth = userWidth > 0 && userWidth <= width ? userWidth : width;
        frameHeight = userHeight > 0 && userHeight <= height ? userHeight : inferFrameLength(height, frameWidth);
    } else {
        frameHeight = userHeight > 0 && userHeight <= height ? userHeight : height;
        frameWidth = userWidth > 0 && userWidth <= width ? userWidth : inferFrameLength(width, frameHeight);
    }

    const frameCount = direction === 'vertical'
        ? Math.floor(height / frameHeight)
        : Math.floor(width / frameWidth);

    if (frameCount < 2) {
        return null;
    }

    return {
        file,
        img,
        input,
        index,
        direction,
        sourceWidth: width,
        sourceHeight: height,
        frameWidth,
        frameHeight,
        frameCount
    };
}

function updateFrameSpliceSuggestion(items) {
    const candidates = items
        .map((item) => analyzeSpriteStrip(item.img, item.file, item.input, item.index))
        .filter(Boolean);

    if (candidates.length === 0) {
        clearSpliceSuggestion();
        return;
    }

    pendingSplice = candidates.find((candidate) => candidate.input === lastChangedFrameInput) || candidates[0];
    showFrameSpliceSuggestion(pendingSplice);
}

function showFrameSpliceSuggestion(candidate) {
    if (!candidate) {
        clearSpliceSuggestion();
        return;
    }

    const visibleCount = Math.min(candidate.frameCount, MAX_FRAMES);
    const capMessage = candidate.frameCount > MAX_FRAMES
        ? ` Only the first ${MAX_FRAMES} frames will be used.`
        : '';

    if (spliceNotice) {
        spliceNotice.classList.remove('is-hidden');
        spliceNotice.innerHTML = `
            <strong>This might be an image for splicing.</strong>
            Frame ${candidate.index + 1} is ${candidate.sourceWidth}x${candidate.sourceHeight}, so it looks like a ${candidate.direction} strip.
            Splice it into ${visibleCount} uniform ${candidate.frameWidth}x${candidate.frameHeight} frame(s)?${capMessage}
        `;
    }

    if (spliceFrameButton) {
        spliceFrameButton.classList.remove('is-hidden');
        spliceFrameButton.textContent = 'Splice image';
    }
}

function clearSpliceSuggestion() {
    pendingSplice = null;
    if (spliceFrameButton) {
        spliceFrameButton.classList.add('is-hidden');
    }
    if (spliceNotice) {
        spliceNotice.classList.add('is-hidden');
        spliceNotice.textContent = '';
    }
}

async function splicePendingImage() {
    if (!pendingSplice || !framesContainer) return;

    if (typeof DataTransfer === 'undefined' || typeof File === 'undefined') {
        if (spliceNotice) {
            spliceNotice.classList.remove('is-hidden');
            spliceNotice.innerHTML = '<strong>Unable to splice:</strong> this browser does not support creating frame files from the image.';
        }
        return;
    }

    const candidate = pendingSplice;
    const frameTotal = Math.min(candidate.frameCount, MAX_FRAMES);
    const files = await createSplicedFrameFiles(candidate, frameTotal);
    if (files.length < 2) {
        if (spliceNotice) {
            spliceNotice.classList.remove('is-hidden');
            spliceNotice.innerHTML = '<strong>Unable to splice:</strong> the image did not produce enough frames.';
        }
        return;
    }

    ensureFrameSlots(files.length);

    getFileInputs().forEach(clearInputFile);
    const inputs = getFileInputs();
    files.forEach((file, index) => {
        setInputFile(inputs[index], file);
    });

    setDimensionValue(frameWidthInput, candidate.frameWidth, true);
    setDimensionValue(frameHeightInput, candidate.frameHeight, true);
    if (frameCountInput) frameCountInput.value = `${files.length}`;
    if (directionSelect) directionSelect.value = candidate.direction;

    pendingSplice = null;
    lastChangedFrameInput = inputs[0] || null;
    await updateSelectedPreviews();

    updateHint(`Spliced ${files.length} frame(s) from ${candidate.file.name}`);
    if (spliceNotice) {
        spliceNotice.classList.remove('is-hidden');
        spliceNotice.innerHTML = `<strong>Spliced:</strong> created ${files.length} uniform ${candidate.frameWidth}x${candidate.frameHeight} frame(s) from ${escapeHtml(candidate.file.name)}.`;
    }
    if (spliceFrameButton) {
        spliceFrameButton.classList.add('is-hidden');
    }
}

async function createSplicedFrameFiles(candidate, frameTotal) {
    const files = [];
    const canvas = document.createElement('canvas');
    canvas.width = candidate.frameWidth;
    canvas.height = candidate.frameHeight;
    const ctx = canvas.getContext('2d');
    const baseName = candidate.file.name.replace(/\.[^.]+$/, '') || 'frame';

    for (let index = 0; index < frameTotal; index += 1) {
        const sourceX = candidate.direction === 'horizontal' ? index * candidate.frameWidth : 0;
        const sourceY = candidate.direction === 'vertical' ? index * candidate.frameHeight : 0;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
            candidate.img,
            sourceX,
            sourceY,
            candidate.frameWidth,
            candidate.frameHeight,
            0,
            0,
            candidate.frameWidth,
            candidate.frameHeight
        );

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
            files.push(new File([blob], `${baseName}-frame-${String(index + 1).padStart(2, '0')}.png`, { type: 'image/png' }));
        }
    }

    return files;
}

function detectSpriteSheet(file) {
    if (!file || !file.type.startsWith('image/') || !spriteHintBox) {
        return;
    }

    loadImage(file).then((img) => {
        const suggestion = analyzeSpriteStrip(img, file);
        if (!suggestion) {
            spriteHintBox.innerHTML = '<strong>Hint:</strong> This image does not look like a uniform sprite strip.';
            return;
        }

        spriteHintBox.innerHTML = `
            <strong>This might be an image for splicing.</strong>
            It looks like a ${suggestion.direction} strip with ${suggestion.frameCount} frame(s).
            <br><button type="button" class="button" id="confirmSpliceButton">Use sprite-sheet slicing</button>
        `;

        const confirmButton = document.getElementById('confirmSpliceButton');
        if (confirmButton) {
            confirmButton.addEventListener('click', () => {
                const uploadModeInput = document.querySelector('input[name="upload_mode"][value="sprite_sheet"]');
                if (uploadModeInput) {
                    uploadModeInput.checked = true;
                }
                setUploadMode('sprite_sheet');
                setDimensionValue(frameWidthInput, suggestion.frameWidth, true);
                setDimensionValue(frameHeightInput, suggestion.frameHeight, true);
                if (frameCountInput) frameCountInput.value = `${suggestion.frameCount}`;
                if (directionSelect) directionSelect.value = suggestion.direction;
                spriteHintBox.innerHTML = `<strong>Splice confirmed:</strong> using ${suggestion.frameWidth}x${suggestion.frameHeight} frames, ${suggestion.frameCount} frames total.`;
            });
        }
    }).catch(() => {
        spriteHintBox.innerHTML = '<strong>Hint:</strong> Unable to read the selected image.';
    });
}

function handleSpriteFileChange() {
    if (!spriteInput || !spriteInput.files || spriteInput.files.length === 0) {
        return;
    }
    detectSpriteSheet(spriteInput.files[0]);
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
    getFileInputs().forEach(bindFrameInput);
}

function setUploadMode(mode) {
    const spriteUploadSection = document.getElementById('spriteUploadSection');
    const framesUploadSection = document.getElementById('framesUploadSection');
    const sliceControls = document.getElementById('sliceControls');
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

    if (spriteHintBox) {
        spriteHintBox.style.display = mode === 'frames' ? 'none' : 'block';
    }
}

markUserEdited(frameWidthInput);
markUserEdited(frameHeightInput);
initializeFrameInputs();

if (addFrameButton) {
    addFrameButton.addEventListener('click', () => {
        if (getFrameCount() >= MAX_FRAMES || !framesContainer) return;
        framesContainer.appendChild(createFrameInput());
        updateFrameLabels();
    });
}

if (spliceFrameButton) {
    spliceFrameButton.addEventListener('click', splicePendingImage);
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

if (uploadModeInputs.length) {
    uploadModeInputs.forEach((input) => {
        input.addEventListener('change', () => setUploadMode(input.value));
    });

    const checkedMode = Array.from(uploadModeInputs).find((input) => input.checked);
    setUploadMode(checkedMode ? checkedMode.value : uploadModeInputs[0].value);
}

document.addEventListener('paste', (event) => {
    const files = event.clipboardData && event.clipboardData.files;
    if (files && files.length > 0) {
        handleFiles(files);
        event.preventDefault();
    }
});

if (spriteInput) {
    spriteInput.addEventListener('change', handleSpriteFileChange);
}

updateSelectedPreviews();
