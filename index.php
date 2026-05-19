<?php
require_once __DIR__ . '/lib/functions.php';

$result = null;
$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $result = handle_upload_and_convert();
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$recent = get_recent_outputs();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Sprite GIF Converter / Editor</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
<main class="wrap">
    <header class="hero">
        <div>
            <h1>Sprite GIF Converter / Editor</h1>
            <p>Upload a sprite image or sprite sheet, convert it to GIF, preview it, then download the result.</p>
        </div>
    </header>

    <?php if ($error): ?>
        <section class="alert error">
            <strong>Error:</strong> <?= h($error) ?>
        </section>
    <?php endif; ?>

    <?php if ($result): ?>
        <section class="card success-card">
            <h2>Converted GIF</h2>
            <div class="preview-box">
                <img src="<?= h($result['output_url']) ?>?t=<?= time() ?>" alt="Generated GIF preview">
            </div>
            <p class="muted">
                <?= h($result['message']) ?>
            </p>
            <a class="button" href="<?= h($result['output_url']) ?>" download>Download GIF</a>
        </section>
    <?php endif; ?>

    <section class="card">
        <h2>Upload and Convert</h2>

        <form method="post" enctype="multipart/form-data" class="form">
            <div class="grid">
                <label class="checkbox">
                    <input type="radio" name="upload_mode" value="single" checked>
                    <span>Single image</span>
                </label>

                <label class="checkbox">
                    <input type="radio" name="upload_mode" value="sprite_sheet">
                    <span>Sprite sheet cropper</span>
                </label>

                <label class="checkbox">
                    <input type="radio" name="upload_mode" value="frames">
                    <span>Multiple frame files</span>
                </label>
            </div>

            <input type="hidden" name="slice_enabled" id="sliceEnabledInput" value="0">

            <div id="spriteUploadSection">
                <label class="field">
                    <span>Sprite / image file</span>
                    <input type="file" name="sprite" id="spriteInput" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif" required>
                </label>
            </div>

            <div id="framesUploadSection" class="is-hidden">
                <div class="frames-grid" id="framesContainer">
                    <label class="field upload-field">
                        <span>Frame 1</span>
                        <input type="file" name="frames[]" class="frame-input" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif">
                        <div class="frame-preview-card" id="framePreview1">
                            <div class="preview-placeholder-small">No image selected</div>
                        </div>
                    </label>

                    <label class="field upload-field">
                        <span>Frame 2</span>
                        <input type="file" name="frames[]" class="frame-input" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif">
                        <div class="frame-preview-card" id="framePreview2">
                            <div class="preview-placeholder-small">No image selected</div>
                        </div>
                    </label>
                </div>

                <button type="button" class="button" id="addFrameButton">+ Add frame</button>

                <label class="field drop-zone" id="dropZone">
                    <span>Quick upload</span>
                    <p class="drop-zone-hint">Drag & drop 2 or more images here or paste them from the clipboard.</p>
                </label>

                <section class="preview-section">
                    <h3>Selected frames preview</h3>
                    <div class="preview-grid" id="previewGrid">
                        <div class="preview-placeholder">Select images to preview removed background here.</div>
                    </div>
                </section>

                <div class="suggestion-row">
                    <div>Suggested width: <strong id="suggestedWidth">32</strong></div>
                    <div>Suggested height: <strong id="suggestedHeight">32</strong></div>
                    <div>Max width: <strong id="maxWidth">32</strong></div>
                    <div>Max height: <strong id="maxHeight">32</strong></div>
                </div>
            </div>

            <div class="grid is-hidden" id="sliceControls">
                <label class="field">
                    <span>Frame width</span>
                    <input type="number" name="frame_width" min="1" value="32">
                </label>

                <label class="field">
                    <span>Frame height</span>
                    <input type="number" name="frame_height" min="1" value="32">
                </label>

                <label class="field">
                    <span>Start X</span>
                    <input type="number" name="start_x" min="0" value="0">
                </label>

                <label class="field">
                    <span>Start Y</span>
                    <input type="number" name="start_y" min="0" value="0">
                </label>

                <label class="field">
                    <span>Frame count</span>
                    <input type="number" name="frame_count" min="1" value="4">
                </label>

                <label class="field">
                    <span>Frame delay, ms</span>
                    <input type="number" name="delay_ms" min="20" value="120">
                </label>

                <label class="field">
                    <span>Direction</span>
                    <select name="direction">
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                    </select>
                </label>

                <label class="field">
                    <span>Loop count</span>
                    <select name="loop">
                        <option value="0">Forever</option>
                        <option value="1">Once</option>
                    </select>
                </label>
            </div>

            <button class="button primary" type="submit">Convert to GIF</button>
        </form>
    </section>

    <?php if ($recent): ?>
        <section class="card">
            <h2>Recent Outputs</h2>
            <div class="recent">
                <?php foreach ($recent as $item): ?>
                    <a class="recent-item" href="<?= h($item['url']) ?>" download>
                        <img src="<?= h($item['url']) ?>?t=<?= h((string)$item['mtime']) ?>" alt="">
                        <span><?= h($item['name']) ?></span>
                    </a>
                <?php endforeach; ?>
            </div>
        </section>
    <?php endif; ?>
</main>

<script src="assets/app.js"></script>
</body>
</html>
