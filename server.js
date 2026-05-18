const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { once } = require('events');
const sharp = require('sharp');
const GIFEncoder = require('gifencoder');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');

function ensureDirectory(dir) {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
}

ensureDirectory(uploadsDir);
ensureDirectory(outputsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadFrames = upload.array('frames', 12);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/outputs', express.static(outputsDir));

app.get('/', async (req, res) => {
  const recent = await getRecentOutputs();
  res.render('index', { error: null, result: null, recent });
});

app.post('/', uploadFrames, async (req, res) => {
  const recent = await getRecentOutputs();

  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length < 2) {
      throw new Error('Please upload at least 2 frames to create an animated GIF.');
    }

    const result = await handleUploadAndConvert(files, req.body);
    return res.render('index', { error: null, result, recent });
  } catch (error) {
    return res.render('index', { error: error.message || 'An error occurred.', result: null, recent });
  }
});

async function handleUploadAndConvert(files, body) {
  const allowed = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif'
  };

  const frameRate = Math.max(1, Math.min(60, parseInt(body.frame_rate, 10) || 24));
  const loop = body.loop === '1' ? 1 : 0;
  const requestedWidth = Math.max(0, parseInt(body.frame_width, 10) || 0);
  const requestedHeight = Math.max(0, parseInt(body.frame_height, 10) || 0);

  const frameInfos = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!allowed[file.mimetype]) {
      throw new Error(`Unsupported file type for frame ${i + 1}. Upload PNG, JPG, JPEG, WebP, or GIF.`);
    }

    await removeBackgroundFromImage(file.path);
    const metadata = await sharp(file.path).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read uploaded image for frame ${i + 1}.`);
    }

    frameInfos.push({ path: file.path, width: metadata.width, height: metadata.height });
  }

  if (frameInfos.length === 0) {
    throw new Error('Please upload at least one image.');
  }

  const maxWidth = Math.max(...frameInfos.map((item) => item.width));
  const maxHeight = Math.max(...frameInfos.map((item) => item.height));
  const targetWidth = requestedWidth || maxWidth;
  const targetHeight = requestedHeight || maxHeight;

  const frames = await prepareFrames(frameInfos, targetWidth, targetHeight);
  if (frames.length === 0) {
    throw new Error('No frames were created. Check the uploaded images.');
  }

  const outputFilename = `${Date.now()}-${Math.random().toString(16).slice(2)}.gif`;
  const outputPath = path.join(outputsDir, outputFilename);
  const outputUrl = `/outputs/${outputFilename}`;

  const animated = await createAnimatedGif(frames, outputPath, {
    width: targetWidth,
    height: targetHeight,
    delay: Math.max(2, Math.round(1000 / frameRate)),
    loop
  });

  if (!animated) {
    throw new Error('Could not create animated GIF from the selected frames.');
  }

  return {
    output_url: outputUrl,
    message: `Created an animated GIF from ${frames.length} frame(s) at ${frameRate} fps.`
  };
}

async function prepareFrames(frameInfos, targetWidth, targetHeight) {
  const frames = [];
  for (const item of frameInfos) {
    const { data, info } = await sharp(item.path)
      .ensureAlpha()
      .resize(targetWidth, targetHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    frames.push({ data, width: info.width, height: info.height });
  }
  return frames;
}

async function removeBackgroundFromImage(inputPath) {
  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    return;
  }

  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const bgColor = estimateBackgroundColor(data, metadata.width, metadata.height);
  const tolerance = 45;
  const pixelCount = metadata.width * metadata.height;
  const outputBuffer = Buffer.from(data);

  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    if (a > 0 && isSimilarColor(r, g, b, bgColor, tolerance)) {
      outputBuffer[idx + 3] = 0;
    }
  }

  await sharp(outputBuffer, {
    raw: {
      width: metadata.width,
      height: metadata.height,
      channels: 4
    }
  }).png().toFile(inputPath);
}

function estimateBackgroundColor(data, width, height) {
  const samples = sampleBorderPixels(data, width, height, Math.max(4, Math.floor(Math.min(width, height) / 12)));
  if (samples.length === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  const bucket = new Map();
  for (const sample of samples) {
    const key = `${Math.round(sample.r / 16)},${Math.round(sample.g / 16)},${Math.round(sample.b / 16)}`;
    const existing = bucket.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.set(key, {
      count: existing.count + 1,
      r: existing.r + sample.r,
      g: existing.g + sample.g,
      b: existing.b + sample.b
    });
  }

  let best = null;
  for (const value of bucket.values()) {
    if (!best || value.count > best.count) {
      best = value;
    }
  }

  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count)
  };
}

function sampleBorderPixels(data, width, height, step = 6) {
  const samples = [];

  function addPixel(x, y) {
    const idx = (y * width + x) * 4;
    samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  }

  for (let x = 0; x < width; x += step) {
    addPixel(x, 0);
    addPixel(x, height - 1);
  }

  for (let y = 0; y < height; y += step) {
    addPixel(0, y);
    addPixel(width - 1, y);
  }

  addPixel(width - 1, 0);
  addPixel(0, height - 1);
  addPixel(width - 1, height - 1);

  return samples;
}

function isSimilarColor(r, g, b, target, tolerance) {
  return (
    Math.abs(r - target.r) <= tolerance &&
    Math.abs(g - target.g) <= tolerance &&
    Math.abs(b - target.b) <= tolerance
  );
}

async function createAnimatedGif(frames, outputPath, settings) {
  try {
    const encoder = new GIFEncoder(settings.width, settings.height);
    const writeStream = fsSync.createWriteStream(outputPath);

    encoder.createReadStream().pipe(writeStream);
    encoder.start();
    encoder.setRepeat(settings.loop);
    encoder.setDelay(settings.delay);
    encoder.setQuality(10);

    for (const frame of frames) {
      encoder.addFrame(frame.data);
    }

    encoder.finish();
    await once(writeStream, 'finish');

    const stats = await fs.stat(outputPath);
    return stats.size > 0;
  } catch (error) {
    return false;
  }
}

async function getRecentOutputs() {
  try {
    const filenames = await fs.readdir(outputsDir);
    const gifFiles = filenames.filter((name) => name.toLowerCase().endsWith('.gif'));
    const withStats = await Promise.all(gifFiles.map(async (name) => {
      const stats = await fs.stat(path.join(outputsDir, name));
      return { name, mtime: stats.mtimeMs };
    }));

    withStats.sort((a, b) => b.mtime - a.mtime);

    return withStats.slice(0, 8).map((item) => ({
      name: item.name,
      url: `/outputs/${item.name}`,
      mtime: item.mtime
    }));
  } catch {
    return [];
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
