<?php

function h(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function handle_upload_and_convert(): array {
    ensure_dirs();

    if (!isset($_FILES['sprite']) || $_FILES['sprite']['error'] !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Please upload a valid image file.');
    }

    $file = $_FILES['sprite'];

    if ($file['size'] <= 0 || $file['size'] > 10 * 1024 * 1024) {
        throw new RuntimeException('File must be larger than 0 bytes and smaller than 10 MB.');
    }

    $mime = mime_content_type($file['tmp_name']);
    $allowed = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    if (!isset($allowed[$mime])) {
        throw new RuntimeException('Unsupported file type. Upload PNG, JPG, JPEG, WebP, or GIF.');
    }

    $id = date('Ymd_His') . '_' . bin2hex(random_bytes(4));
    $inputPath = __DIR__ . '/../uploads/' . $id . '.' . $allowed[$mime];
    $outputPath = __DIR__ . '/../outputs/' . $id . '.gif';
    $outputUrl = 'outputs/' . basename($outputPath);

    if (!move_uploaded_file($file['tmp_name'], $inputPath)) {
        throw new RuntimeException('Could not save uploaded file.');
    }

    $image = load_image($inputPath, $mime);
    if (!$image) {
        throw new RuntimeException('Could not read the uploaded image.');
    }

    imagepalettetotruecolor($image);
    imagesavealpha($image, true);

    $sliceEnabled = isset($_POST['slice_enabled']) && $_POST['slice_enabled'] === '1';

    if (!$sliceEnabled) {
        save_static_gif($image, $outputPath);
        imagedestroy($image);

        return [
            'output_url' => $outputUrl,
            'message' => 'Created a static GIF from the uploaded image.',
        ];
    }

    $settings = read_slice_settings();
    $framesDir = __DIR__ . '/../outputs/frames_' . $id;
    mkdir($framesDir, 0775, true);

    $frames = slice_frames($image, $framesDir, $settings);
    imagedestroy($image);

    if (!$frames) {
        throw new RuntimeException('No frames were created. Check the frame size, start position, and frame count.');
    }

    $animated = create_animated_gif($frames, $outputPath, $settings);

    cleanup_dir($framesDir);

    if ($animated) {
        $message = 'Created an animated GIF from ' . count($frames) . ' frame(s).';
    } else {
        // Fallback: static first frame
        $first = imagecreatefrompng($frames[0]);
        save_static_gif($first, $outputPath);
        imagedestroy($first);
        $message = 'ImageMagick was not available, so a static GIF was created from the first frame.';
    }

    return [
        'output_url' => $outputUrl,
        'message' => $message,
    ];
}

function ensure_dirs(): void {
    foreach ([__DIR__ . '/../uploads', __DIR__ . '/../outputs'] as $dir) {
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        if (!is_writable($dir)) {
            throw new RuntimeException('Folder is not writable: ' . basename($dir));
        }
    }
}

function load_image(string $path, string $mime) {
    return match ($mime) {
        'image/png' => imagecreatefrompng($path),
        'image/jpeg' => imagecreatefromjpeg($path),
        'image/webp' => function_exists('imagecreatefromwebp') ? imagecreatefromwebp($path) : false,
        'image/gif' => imagecreatefromgif($path),
        default => false,
    };
}

function save_static_gif($image, string $outputPath): void {
    $canvas = imagecreatetruecolor(imagesx($image), imagesy($image));
    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
    imagefill($canvas, 0, 0, $transparent);
    imagecopy($canvas, $image, 0, 0, 0, 0, imagesx($image), imagesy($image));

    if (!imagegif($canvas, $outputPath)) {
        imagedestroy($canvas);
        throw new RuntimeException('Could not write GIF output.');
    }

    imagedestroy($canvas);
}

function read_slice_settings(): array {
    $settings = [
        'frame_width' => max(1, (int)($_POST['frame_width'] ?? 32)),
        'frame_height' => max(1, (int)($_POST['frame_height'] ?? 32)),
        'start_x' => max(0, (int)($_POST['start_x'] ?? 0)),
        'start_y' => max(0, (int)($_POST['start_y'] ?? 0)),
        'frame_count' => max(1, min(300, (int)($_POST['frame_count'] ?? 1))),
        'delay_ms' => max(20, min(5000, (int)($_POST['delay_ms'] ?? 120))),
        'direction' => ($_POST['direction'] ?? 'horizontal') === 'vertical' ? 'vertical' : 'horizontal',
        'loop' => ($_POST['loop'] ?? '0') === '1' ? 1 : 0,
    ];

    return $settings;
}

function slice_frames($image, string $framesDir, array $settings): array {
    $frames = [];
    $sourceW = imagesx($image);
    $sourceH = imagesy($image);

    for ($i = 0; $i < $settings['frame_count']; $i++) {
        $srcX = $settings['start_x'];
        $srcY = $settings['start_y'];

        if ($settings['direction'] === 'horizontal') {
            $srcX += $i * $settings['frame_width'];
        } else {
            $srcY += $i * $settings['frame_height'];
        }

        if (
            $srcX < 0 ||
            $srcY < 0 ||
            $srcX + $settings['frame_width'] > $sourceW ||
            $srcY + $settings['frame_height'] > $sourceH
        ) {
            break;
        }

        $frame = imagecreatetruecolor($settings['frame_width'], $settings['frame_height']);
        imagealphablending($frame, false);
        imagesavealpha($frame, true);
        $transparent = imagecolorallocatealpha($frame, 0, 0, 0, 127);
        imagefill($frame, 0, 0, $transparent);

        imagecopy(
            $frame,
            $image,
            0,
            0,
            $srcX,
            $srcY,
            $settings['frame_width'],
            $settings['frame_height']
        );

        $framePath = $framesDir . '/frame_' . str_pad((string)$i, 4, '0', STR_PAD_LEFT) . '.png';
        imagepng($frame, $framePath);
        imagedestroy($frame);
        $frames[] = $framePath;
    }

    return $frames;
}

function create_animated_gif(array $frames, string $outputPath, array $settings): bool {
    $binary = find_imagemagick_binary();
    if (!$binary) {
        return false;
    }

    $delayCs = max(2, (int)round($settings['delay_ms'] / 10)); // ImageMagick delay is centiseconds.

    $cmd = escapeshellcmd($binary)
        . ' -delay ' . escapeshellarg((string)$delayCs)
        . ' -loop ' . escapeshellarg((string)$settings['loop'])
        . ' ';

    foreach ($frames as $frame) {
        $cmd .= escapeshellarg($frame) . ' ';
    }

    $cmd .= escapeshellarg($outputPath) . ' 2>&1';

    exec($cmd, $output, $exitCode);

    return $exitCode === 0 && file_exists($outputPath) && filesize($outputPath) > 0;
}

function find_imagemagick_binary(): ?string {
    $candidates = ['magick', 'convert'];

    foreach ($candidates as $candidate) {
        $cmd = stripos(PHP_OS, 'WIN') === 0
            ? 'where ' . escapeshellarg($candidate) . ' 2>NUL'
            : 'command -v ' . escapeshellarg($candidate) . ' 2>/dev/null';

        exec($cmd, $output, $exitCode);

        if ($exitCode === 0) {
            return $candidate;
        }
    }

    return null;
}

function cleanup_dir(string $dir): void {
    if (!is_dir($dir)) {
        return;
    }

    $items = scandir($dir);
    if (!$items) {
        return;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_file($path)) {
            unlink($path);
        }
    }

    rmdir($dir);
}

function get_recent_outputs(): array {
    $dir = __DIR__ . '/../outputs';
    if (!is_dir($dir)) {
        return [];
    }

    $files = glob($dir . '/*.gif') ?: [];
    usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));

    $items = [];
    foreach (array_slice($files, 0, 8) as $file) {
        $items[] = [
            'name' => basename($file),
            'url' => 'outputs/' . basename($file),
            'mtime' => filemtime($file),
        ];
    }

    return $items;
}
