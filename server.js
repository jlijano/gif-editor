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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/outputs', express.static(outputsDir));

app.get('/', async (req, res) => {
  const recent = await getRecentOutputs();
  res.render('index', { error: null, result: null, recent });
});

app.post('/', upload.single('sprite'), async (req, res) => {
  const recent = await getRecentOutputs();

  try {
    if (!req.file) {
      throw new Error('Please upload a valid image file.');
    }

    const result = await handleUploadAndConvert(req.file, req.body);
    return res.render('index', { error: null, result, recent });
  } catch (error) {
    return res.render('index', { error: error.message || 'An error occurred.', result: null, recent });
  }
});

async function handleUploadAndConvert(file, body) {
  const allowed = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif'
  };

  if (!allowed[file.mimetype]) {
    throw new Error('Unsupported file type. Upload PNG, JPG, JPEG, WebP, or GIF.');
  }

  const inputPath = file.path;
  const outputFilename = `${Date.now()}-${Math.random().toString(16).slice(2)}.gif`;
  const outputPath = path.join(outputsDir, outputFilename);
  const outputUrl = `/outputs/${outputFilename}`;

  const sliceEnabled = body.slice_enabled === '1';

  if (!sliceEnabled) {
    await sharp(inputPath).gif().toFile(outputPath);
    return {
      output_url: outputUrl,
      message: 'Created a static GIF from the uploaded image.'
    };
  }

  const settings = readSliceSettings(body);
  const frames = await sliceFrames(inputPath, settings);

  if (frames.length === 0) {
    throw new Error('No frames were created. Check the frame size, start position, and frame count.');
  }

  const animated = await createAnimatedGif(frames, outputPath, settings);

  if (animated) {
    return {
      output_url: outputUrl,
      message: `Created an animated GIF from ${frames.length} frame(s).`
    };
  }

  await sharp(frames[0].data, {
    raw: {
      width: settings.frame_width,
      height: settings.frame_height,
      channels: 4
    }
  }).gif().toFile(outputPath);

  return {
    output_url: outputUrl,
    message: 'Animated GIF generation failed, so a static GIF was created from the first frame.'
  };
}

function readSliceSettings(body) {
  return {
    frame_width: Math.max(1, parseInt(body.frame_width, 10) || 32),
    frame_height: Math.max(1, parseInt(body.frame_height, 10) || 32),
    start_x: Math.max(0, parseInt(body.start_x, 10) || 0),
    start_y: Math.max(0, parseInt(body.start_y, 10) || 0),
    frame_count: Math.max(1, Math.min(300, parseInt(body.frame_count, 10) || 1)),
    delay_ms: Math.max(20, Math.min(5000, parseInt(body.delay_ms, 10) || 120)),
    direction: body.direction === 'vertical' ? 'vertical' : 'horizontal',
    loop: body.loop === '1' ? 1 : 0
  };
}

async function sliceFrames(inputPath, settings) {
  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();
  const frames = [];

  for (let i = 0; i < settings.frame_count; i += 1) {
    const left = settings.direction === 'horizontal'
      ? settings.start_x + i * settings.frame_width
      : settings.start_x;

    const top = settings.direction === 'vertical'
      ? settings.start_y + i * settings.frame_height
      : settings.start_y;

    if (
      left < 0 || top < 0 ||
      left + settings.frame_width > metadata.width ||
      top + settings.frame_height > metadata.height
    ) {
      break;
    }

    const frame = await image.clone()
      .extract({ left, top, width: settings.frame_width, height: settings.frame_height })
      .raw()
      .toBuffer({ resolveWithObject: true });

    frames.push(frame);
  }

  return frames;
}

async function createAnimatedGif(frames, outputPath, settings) {
  try {
    const encoder = new GIFEncoder(settings.frame_width, settings.frame_height);
    const writeStream = fsSync.createWriteStream(outputPath);

    encoder.createReadStream().pipe(writeStream);
    encoder.start();
    encoder.setRepeat(settings.loop);
    encoder.setDelay(settings.delay_ms);
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
