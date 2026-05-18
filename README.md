# Sprite GIF Converter / Editor for XAMPP

A small PHP app that lets you upload a sprite image, optionally slice it into frames, convert it to GIF, preview it, and download the result.

## Features

- Upload PNG, JPG, JPEG, WebP, or GIF.
- Convert a single image into GIF.
- Slice a sprite sheet into frames.
- Build an animated GIF from sprite-sheet frames.
- Set frame width, height, start position, frame count, frame delay, and direction.
- Preview and download the generated GIF.
- Runs locally in XAMPP.

## Requirements

- XAMPP with PHP 8+
- PHP GD extension enabled
- ImageMagick `convert` command recommended for animated GIF output

### Important

PHP GD can save static GIF files, but it cannot natively assemble high-quality animated GIFs by itself.  
This app uses ImageMagick when available for animated GIF generation.

If ImageMagick is not installed, the app will still create a static GIF from the first frame.

## XAMPP Setup

1. Copy the `sprite-gif-editor` folder into:

   `C:\xampp\htdocs\`

2. Start Apache from the XAMPP Control Panel.

3. Open:

   `http://localhost/sprite-gif-editor/`

4. Make sure these folders are writable:

   - `uploads`
   - `outputs`

## Optional: Install ImageMagick on Windows

1. Download ImageMagick for Windows.
2. During installation, enable:
   - Add application directory to your system path
   - Install legacy utilities, if available
3. Restart Apache.
4. In Command Prompt, test:

   `magick -version`

The app tries `magick` first, then `convert`.

## Usage

For a single image:
- Upload the image.
- Leave frame slicing unchecked.
- Click Convert.

For a sprite sheet:
- Upload the sprite sheet.
- Enable sprite-sheet slicing.
- Enter frame width and frame height.
- Enter frame count.
- Choose horizontal or vertical direction.
- Set frame delay.
- Click Convert.

## Security Note

This is intended for local/offline use in XAMPP. If you deploy it publicly, add stricter validation, authentication, rate limits, and cleanup jobs.
