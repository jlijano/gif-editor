const dropZone = document.getElementById('dropZone');
const framesContainer = document.getElementById('framesContainer');
const addFrameButton = document.getElementById('addFrameButton');
const spliceFrameButton = document.getElementById('spliceFrameButton');
const manualSpliceToggle = document.getElementById('manualSpliceToggle');
const manualSplicePanel = document.getElementById('manualSplicePanel');
const manualSpliceButton = document.getElementById('manualSpliceButton');
const manualSpliceMessage = document.getElementById('manualSpliceMessage');
const manualSourceFrameSelect = document.getElementById('manualSourceFrame');
const manualCropStage = document.getElementById('manualCropStage');
const manualCropCanvas = document.getElementById('manualCropCanvas');
const manualCropInfo = document.getElementById('manualCropInfo');
const manualCropResetButton = document.getElementById('manualCropResetButton');
const manualFrameCountInput = document.getElementById('manualFrameCount');
const manualFrameCountValue = document.getElementById('manualFrameCountValue');
const manualDirectionSelect = document.getElementById('manualDirection');
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
let currentImageItems = [];
let manualCropState = {
    item: null,
    rect: { x: 0, y: 0, width: 32, height: 32 },
    display: { scale: 1, width: 0, height: 0 },
    drag: null
};
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

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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

function markManualUserEdited(input) {
    if (!input) return;
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
        input.dataset.userEdited = 'true';
        hideManualMessage();
        updateManualCropInfo();
        renderManualCropper();
    });
}

function setManualValue(input, value, force = false) {
    if (!input) return;
    if (force || !wasUserEdited(input)) {
        input.value = `${value}`;
    }
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

function updateManualSourceOptions(items) {
    if (!manualSourceFrameSelect) return;

    const previousValue = manualSourceFrameSelect.value;
    manualSourceFrameSelect.innerHTML = '';

    if (items.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No image selected';
        manualSourceFrameSelect.appendChild(option);
        manualSourceFrameSelect.disabled = true;
        if (manualSpliceButton) manualSpliceButton.disabled = true;
        setManualCropSelection(null);
        return;
    }

    items.forEach((item) => {
        const option = document.createElement('option');
        option.value = `${item.index}`;
        option.textContent = `Frame ${item.index + 1} - ${item.file.name}`;
        manualSourceFrameSelect.appendChild(option);
    });

    manualSourceFrameSelect.disabled = false;
    if (manualSpliceButton) manualSpliceButton.disabled = false;

    const hasPrevious = items.some((item) => `${item.index}` === previousValue);
    if (hasPrevious) {
        manualSourceFrameSelect.value = previousValue;
    } else if (lastChangedFrameInput) {
        const selected = items.find((item) => item.input === lastChangedFrameInput);
        manualSourceFrameSelect.value = selected ? `${selected.index}` : `${items[0].index}`;
    } else {
        manualSourceFrameSelect.value = `${items[0].index}`;
    }
}

function getManualDirection() {
    return manualDirectionSelect && manualDirectionSelect.value === 'vertical' ? 'vertical' : 'horizontal';
}

function getManualFrameCountValue() {
    return clamp(getPositiveInteger(manualFrameCountInput && manualFrameCountInput.value) || 2, 2, MAX_FRAMES);
}

function normalizeCropRect(rect, item) {
    if (!item) {
        return { x: 0, y: 0, width: 1, height: 1 };
    }

    const width = clamp(Math.round(rect.width || 1), 1, item.width);
    const height = clamp(Math.round(rect.height || 1), 1, item.height);
    const x = clamp(Math.round(rect.x || 0), 0, Math.max(0, item.width - width));
    const y = clamp(Math.round(rect.y || 0), 0, Math.max(0, item.height - height));

    return { x, y, width, height };
}

function getManualDefaultRect(item) {
    if (!item) return { x: 0, y: 0, width: 32, height: 32 };

    const width = getPositiveInteger(frameWidthInput && frameWidthInput.value);
    const height = getPositiveInteger(frameHeightInput && frameHeightInput.value);

    return normalizeCropRect({
        x: 0,
        y: 0,
        width: width > 0 ? Math.min(width, item.width) : Math.min(item.width, item.height),
        height: height > 0 ? Math.min(height, item.height) : Math.min(item.width, item.height)
    }, item);
}

function setManualCropSelection(item, rect = null, force = false) {
    if (!item) {
        manualCropState.item = null;
        manualCropState.rect = { x: 0, y: 0, width: 32, height: 32 };
        manualCropState.drag = null;
        manualCropState.userEdited = false;
        updateManualCropInfo();
        renderManualCropper();
        return;
    }

    const sameItem = manualCropState.item && manualCropState.item.file === item.file && manualCropState.item.index === item.index;
    manualCropState.item = item;

    if (force || !sameItem || !manualCropState.userEdited) {
        manualCropState.rect = normalizeCropRect(rect || getManualDefaultRect(item), item);
        manualCropState.userEdited = false;
    } else {
        manualCropState.rect = normalizeCropRect(manualCropState.rect, item);
    }

    updateManualCropInfo();
    renderManualCropper();
}

function getManualMaxFrameCount(rect = manualCropState.rect, item = manualCropState.item) {
    if (!item || !rect) return 1;

    const direction = getManualDirection();
    const availableLength = direction === 'horizontal'
        ? item.width - rect.x
        : item.height - rect.y;
    const frameLength = direction === 'horizontal' ? rect.width : rect.height;

    return Math.max(1, Math.min(MAX_FRAMES, Math.floor(availableLength / Math.max(1, frameLength))));
}

function updateManualCropInfo() {
    const item = manualCropState.item;

    if (!item) {
        if (manualCropInfo) manualCropInfo.textContent = 'No image selected';
        if (manualFrameCountValue) manualFrameCountValue.textContent = '0';
        if (manualFrameCountInput) manualFrameCountInput.disabled = true;
        if (manualCropResetButton) manualCropResetButton.disabled = true;
        if (manualSpliceButton) manualSpliceButton.disabled = true;
        return;
    }

    manualCropState.rect = normalizeCropRect(manualCropState.rect, item);
    const rect = manualCropState.rect;
    const maxFrameCount = getManualMaxFrameCount(rect, item);
    const usableMax = Math.max(2, maxFrameCount);

    if (manualFrameCountInput) {
        manualFrameCountInput.disabled = maxFrameCount < 2;
        manualFrameCountInput.max = `${usableMax}`;
        if (getManualFrameCountValue() > usableMax) {
            manualFrameCountInput.value = `${usableMax}`;
        }
    }

    const selectedCount = maxFrameCount < 2
        ? maxFrameCount
        : Math.min(getManualFrameCountValue(), maxFrameCount);

    if (manualFrameCountValue) {
        manualFrameCountValue.textContent = `${selectedCount}`;
    }

    if (manualCropInfo) {
        manualCropInfo.textContent = `Selected crop - ${selectedCount} frame(s) fit`;
    }

    if (manualCropResetButton) manualCropResetButton.disabled = false;
    if (manualSpliceButton) manualSpliceButton.disabled = maxFrameCount < 2;
}

function getManualFrameRects() {
    const item = manualCropState.item;
    if (!item) return [];

    const rect = normalizeCropRect(manualCropState.rect, item);
    const direction = getManualDirection();
    const maxFrameCount = getManualMaxFrameCount(rect, item);
    const frameCount = Math.min(getManualFrameCountValue(), maxFrameCount);
    const rects = [];

    for (let index = 0; index < frameCount; index += 1) {
        rects.push({
            x: rect.x + (direction === 'horizontal' ? index * rect.width : 0),
            y: rect.y + (direction === 'vertical' ? index * rect.height : 0),
            width: rect.width,
            height: rect.height
        });
    }

    return rects;
}

function drawCanvasPlaceholder() {
    if (!manualCropCanvas) return;

    const ctx = manualCropCanvas.getContext('2d');
    const width = 640;
    const height = 260;
    const dpr = window.devicePixelRatio || 1;

    manualCropCanvas.width = width * dpr;
    manualCropCanvas.height = height * dpr;
    manualCropCanvas.style.width = '100%';
    manualCropCanvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f131b';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#8fa1c5';
    ctx.font = '14px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No image selected', width / 2, height / 2);
}

function renderManualCropper() {
    if (!manualCropCanvas) return;

    const item = manualCropState.item;
    if (!item) {
        drawCanvasPlaceholder();
        return;
    }

    const stageWidth = manualCropStage ? Math.max(260, manualCropStage.clientWidth - 24) : 640;
    const maxHeight = 420;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(0.05, Math.min(stageWidth / item.width, maxHeight / item.height, 4));
    const canvasWidth = Math.max(1, Math.round(item.width * scale));
    const canvasHeight = Math.max(1, Math.round(item.height * scale));
    const ctx = manualCropCanvas.getContext('2d');

    manualCropState.display = { scale, width: canvasWidth, height: canvasHeight };
    manualCropCanvas.width = canvasWidth * dpr;
    manualCropCanvas.height = canvasHeight * dpr;
    manualCropCanvas.style.width = `${canvasWidth}px`;
    manualCropCanvas.style.height = `${canvasHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(item.img, 0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const frameRects = getManualFrameRects();
    frameRects.forEach((frameRect, index) => {
        ctx.drawImage(
            item.img,
            frameRect.x,
            frameRect.y,
            frameRect.width,
            frameRect.height,
            frameRect.x * scale,
            frameRect.y * scale,
            frameRect.width * scale,
            frameRect.height * scale
        );

        ctx.strokeStyle = index === 0 ? '#f8d66d' : 'rgba(109, 140, 255, 0.85)';
        ctx.lineWidth = index === 0 ? 2 : 1;
        ctx.strokeRect(
            Math.round(frameRect.x * scale) + 0.5,
            Math.round(frameRect.y * scale) + 0.5,
            Math.round(frameRect.width * scale),
            Math.round(frameRect.height * scale)
        );
    });

    drawManualCropHandles(ctx);
}

function getManualCropHandles(rect = manualCropState.rect) {
    const left = rect.x;
    const centerX = rect.x + rect.width / 2;
    const right = rect.x + rect.width;
    const top = rect.y;
    const centerY = rect.y + rect.height / 2;
    const bottom = rect.y + rect.height;

    return [
        { name: 'nw', x: left, y: top },
        { name: 'n', x: centerX, y: top },
        { name: 'ne', x: right, y: top },
        { name: 'e', x: right, y: centerY },
        { name: 'se', x: right, y: bottom },
        { name: 's', x: centerX, y: bottom },
        { name: 'sw', x: left, y: bottom },
        { name: 'w', x: left, y: centerY }
    ];
}

function drawManualCropHandles(ctx) {
    const item = manualCropState.item;
    if (!item) return;

    const scale = manualCropState.display.scale;
    const size = 9;

    ctx.fillStyle = '#f8d66d';
    ctx.strokeStyle = '#0f131b';
    ctx.lineWidth = 2;

    getManualCropHandles().forEach((handle) => {
        const x = handle.x * scale;
        const y = handle.y * scale;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    });
}

function getManualCanvasPoint(event) {
    const item = manualCropState.item;
    const canvasBounds = manualCropCanvas.getBoundingClientRect();

    return {
        x: clamp(((event.clientX - canvasBounds.left) / canvasBounds.width) * item.width, 0, item.width),
        y: clamp(((event.clientY - canvasBounds.top) / canvasBounds.height) * item.height, 0, item.height)
    };
}

function getManualCropHit(point) {
    const rect = manualCropState.rect;
    const tolerance = Math.max(6, 10 / manualCropState.display.scale);
    const handle = getManualCropHandles(rect).find((item) => (
        Math.abs(point.x - item.x) <= tolerance &&
        Math.abs(point.y - item.y) <= tolerance
    ));

    if (handle) return handle.name;

    if (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    ) {
        return 'move';
    }

    return 'draw';
}

function setManualCanvasCursor(hit) {
    if (!manualCropCanvas) return;

    const cursors = {
        nw: 'nwse-resize',
        se: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        move: 'move',
        draw: 'crosshair'
    };

    manualCropCanvas.style.cursor = cursors[hit] || 'crosshair';
}

function updateManualCropFromDrag(point) {
    const drag = manualCropState.drag;
    const item = manualCropState.item;
    if (!drag || !item) return;

    const minSize = 1;
    let rect = { ...drag.startRect };

    if (drag.mode === 'move') {
        rect.x = drag.startRect.x + point.x - drag.startPoint.x;
        rect.y = drag.startRect.y + point.y - drag.startPoint.y;
    } else if (drag.mode === 'draw') {
        rect = {
            x: Math.min(drag.startPoint.x, point.x),
            y: Math.min(drag.startPoint.y, point.y),
            width: Math.max(minSize, Math.abs(point.x - drag.startPoint.x)),
            height: Math.max(minSize, Math.abs(point.y - drag.startPoint.y))
        };
    } else {
        let left = drag.startRect.x;
        let top = drag.startRect.y;
        let right = drag.startRect.x + drag.startRect.width;
        let bottom = drag.startRect.y + drag.startRect.height;

        if (drag.mode.includes('w')) left = clamp(point.x, 0, right - minSize);
        if (drag.mode.includes('e')) right = clamp(point.x, left + minSize, item.width);
        if (drag.mode.includes('n')) top = clamp(point.y, 0, bottom - minSize);
        if (drag.mode.includes('s')) bottom = clamp(point.y, top + minSize, item.height);

        rect = {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top
        };
    }

    manualCropState.rect = normalizeCropRect(rect, item);
    manualCropState.userEdited = true;
    hideManualMessage();
    updateManualCropInfo();
    renderManualCropper();
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
        currentImageItems = [];
        updateManualSourceOptions([]);
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

    currentImageItems = loadedItems.filter((item) => !item.error);
    updateManualSourceOptions(currentImageItems);
    updateFrameSpliceSuggestion(currentImageItems);
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
        startX: 0,
        startY: 0,
        frameWidth,
        frameHeight,
        frameCount
    };
}

function syncManualDefaultsFromCandidate(candidate, force = false) {
    if (!candidate) return;

    if (manualSourceFrameSelect && candidate.index !== undefined) {
        manualSourceFrameSelect.value = `${candidate.index}`;
    }

    setManualValue(manualFrameCountInput, Math.min(candidate.frameCount, MAX_FRAMES), force);
    setManualValue(manualDirectionSelect, candidate.direction, force);

    const item = currentImageItems.find((entry) => entry.file === candidate.file && entry.index === candidate.index);
    setManualCropSelection(item || manualCropState.item, {
        x: candidate.startX || 0,
        y: candidate.startY || 0,
        width: candidate.frameWidth,
        height: candidate.frameHeight
    }, force);
}

function syncManualDefaultsFromItem(item, force = false) {
    if (!item) return;

    setManualValue(manualFrameCountInput, 2, force);
    setManualValue(manualDirectionSelect, item.width >= item.height ? 'horizontal' : 'vertical', force);
    setManualCropSelection(item, getManualDefaultRect(item), force);
}

function updateFrameSpliceSuggestion(items) {
    const candidates = items
        .map((item) => analyzeSpriteStrip(item.img, item.file, item.input, item.index))
        .filter(Boolean);

    if (candidates.length === 0) {
        syncManualDefaultsFromItem(items[0]);
        clearSpliceSuggestion();
        return;
    }

    pendingSplice = candidates.find((candidate) => candidate.input === lastChangedFrameInput) || candidates[0];
    syncManualDefaultsFromCandidate(pendingSplice);
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

function showManualMessage(message) {
    if (!manualSpliceMessage) return;
    manualSpliceMessage.classList.remove('is-hidden');
    manualSpliceMessage.innerHTML = message;
}

function hideManualMessage() {
    if (!manualSpliceMessage) return;
    manualSpliceMessage.classList.add('is-hidden');
    manualSpliceMessage.textContent = '';
}

function getSelectedManualSourceItem() {
    if (currentImageItems.length === 0) return null;

    const selectedIndex = manualSourceFrameSelect ? manualSourceFrameSelect.value : '';
    return currentImageItems.find((item) => `${item.index}` === selectedIndex)
        || currentImageItems.find((item) => item.input === lastChangedFrameInput)
        || currentImageItems[0];
}

function buildManualSpliceCandidate() {
    const item = getSelectedManualSourceItem();
    if (!item) {
        showManualMessage('<strong>Manual crop:</strong> select an image first.');
        return null;
    }

    if (manualCropState.item !== item) {
        setManualCropSelection(item, getManualDefaultRect(item), true);
    }

    const rect = normalizeCropRect(manualCropState.rect, item);
    const frameWidth = rect.width;
    const frameHeight = rect.height;
    const startX = rect.x;
    const startY = rect.y;
    const requestedCount = getManualFrameCountValue();
    const direction = getManualDirection();

    if (!frameWidth || !frameHeight || !requestedCount) {
        showManualMessage('<strong>Manual crop:</strong> select a crop area and frame count.');
        return null;
    }

    if (startX + frameWidth > item.width || startY + frameHeight > item.height) {
        showManualMessage('<strong>Manual crop:</strong> the crop box is outside the source image.');
        return null;
    }

    const availableLength = direction === 'horizontal'
        ? item.width - startX
        : item.height - startY;
    const frameLength = direction === 'horizontal' ? frameWidth : frameHeight;
    const maxFrameCount = Math.min(MAX_FRAMES, Math.floor(availableLength / frameLength));
    const frameCount = Math.min(requestedCount, maxFrameCount);

    if (frameCount < 2) {
        showManualMessage('<strong>Manual crop:</strong> at least 2 frames must fit inside the source image.');
        return null;
    }

    return {
        file: item.file,
        img: item.img,
        input: item.input,
        index: item.index,
        direction,
        sourceWidth: item.width,
        sourceHeight: item.height,
        startX,
        startY,
        frameWidth,
        frameHeight,
        frameCount,
        requestedCount
    };
}

async function applySpliceCandidate(candidate, messageTarget = spliceNotice, source = 'auto') {
    if (!candidate || !framesContainer) return;

    if (typeof DataTransfer === 'undefined' || typeof File === 'undefined') {
        if (messageTarget) {
            messageTarget.classList.remove('is-hidden');
            messageTarget.innerHTML = '<strong>Unable to splice:</strong> this browser does not support creating frame files from the image.';
        }
        return;
    }

    const frameTotal = Math.min(candidate.frameCount, MAX_FRAMES);
    const files = await createSplicedFrameFiles(candidate, frameTotal);
    if (files.length < 2) {
        if (messageTarget) {
            messageTarget.classList.remove('is-hidden');
            messageTarget.innerHTML = '<strong>Unable to splice:</strong> the image did not produce enough frames.';
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
    if (messageTarget) {
        const limited = candidate.requestedCount && candidate.requestedCount > files.length
            ? ` Requested ${candidate.requestedCount}, created ${files.length} that fit.`
            : '';
        messageTarget.classList.remove('is-hidden');
        messageTarget.innerHTML = `<strong>${source === 'manual' ? 'Manual crop applied' : 'Spliced'}:</strong> created ${files.length} uniform ${candidate.frameWidth}x${candidate.frameHeight} frame(s) from ${escapeHtml(candidate.file.name)}.${limited}`;
    }
    if (spliceFrameButton) {
        spliceFrameButton.classList.add('is-hidden');
    }
}

async function splicePendingImage() {
    if (!pendingSplice) return;
    await applySpliceCandidate(pendingSplice, spliceNotice, 'auto');
}

async function applyManualSplice() {
    const candidate = buildManualSpliceCandidate();
    if (!candidate) return;
    await applySpliceCandidate(candidate, manualSpliceMessage, 'manual');
}

async function createSplicedFrameFiles(candidate, frameTotal) {
    const files = [];
    const canvas = document.createElement('canvas');
    canvas.width = candidate.frameWidth;
    canvas.height = candidate.frameHeight;
    const ctx = canvas.getContext('2d');
    const baseName = candidate.file.name.replace(/\.[^.]+$/, '') || 'frame';
    const startX = candidate.startX || 0;
    const startY = candidate.startY || 0;

    for (let index = 0; index < frameTotal; index += 1) {
        const sourceX = startX + (candidate.direction === 'horizontal' ? index * candidate.frameWidth : 0);
        const sourceY = startY + (candidate.direction === 'vertical' ? index * candidate.frameHeight : 0);

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
[
    manualFrameCountInput,
    manualDirectionSelect
].forEach(markManualUserEdited);
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

if (manualSpliceToggle && manualSplicePanel) {
    manualSpliceToggle.addEventListener('click', () => {
        manualSplicePanel.classList.toggle('is-hidden');
        renderManualCropper();
    });
}

if (manualSourceFrameSelect) {
    manualSourceFrameSelect.addEventListener('change', () => {
        hideManualMessage();
        const item = getSelectedManualSourceItem();
        if (!item) return;

        const candidate = analyzeSpriteStrip(item.img, item.file, item.input, item.index);
        if (candidate) {
            syncManualDefaultsFromCandidate(candidate, true);
        } else {
            syncManualDefaultsFromItem(item, true);
        }
    });
}

if (manualCropCanvas) {
    manualCropCanvas.addEventListener('pointerdown', (event) => {
        if (!manualCropState.item) return;

        event.preventDefault();
        const point = getManualCanvasPoint(event);
        const hit = getManualCropHit(point);

        manualCropState.drag = {
            mode: hit,
            startPoint: point,
            startRect: { ...manualCropState.rect }
        };

        if (hit === 'draw') {
            manualCropState.rect = normalizeCropRect({
                x: point.x,
                y: point.y,
                width: 1,
                height: 1
            }, manualCropState.item);
            manualCropState.userEdited = true;
            updateManualCropInfo();
            renderManualCropper();
        }

        manualCropCanvas.setPointerCapture(event.pointerId);
    });

    manualCropCanvas.addEventListener('pointermove', (event) => {
        if (!manualCropState.item) return;

        const point = getManualCanvasPoint(event);
        if (manualCropState.drag) {
            event.preventDefault();
            updateManualCropFromDrag(point);
            return;
        }

        setManualCanvasCursor(getManualCropHit(point));
    });

    manualCropCanvas.addEventListener('pointerup', (event) => {
        manualCropState.drag = null;
        if (manualCropCanvas.hasPointerCapture(event.pointerId)) {
            manualCropCanvas.releasePointerCapture(event.pointerId);
        }
    });

    manualCropCanvas.addEventListener('pointercancel', () => {
        manualCropState.drag = null;
    });
}

if (manualCropResetButton) {
    manualCropResetButton.addEventListener('click', () => {
        const item = getSelectedManualSourceItem();
        if (!item) return;

        const candidate = analyzeSpriteStrip(item.img, item.file, item.input, item.index);
        manualCropState.userEdited = false;
        hideManualMessage();

        if (candidate) {
            syncManualDefaultsFromCandidate(candidate, true);
        } else {
            syncManualDefaultsFromItem(item, true);
        }
    });
}

if (manualSpliceButton) {
    manualSpliceButton.addEventListener('click', applyManualSplice);
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

window.addEventListener('resize', renderManualCropper);

updateSelectedPreviews();
