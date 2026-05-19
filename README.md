# Sprite GIF Converter / Editor (Node.js)

A Node.js app that lets you upload a sprite image, optionally slice it into frames, convert it to GIF, preview it, and download the result.

## Features

- Upload PNG, JPG, JPEG, WebP, or GIF.
- Convert a single image into GIF.
- Remove background from uploaded images automatically.
- Slice a sprite sheet into frames.
- Detect tall or wide sprite strips and offer to splice them into uniform frames.
- Build an animated GIF from sprite-sheet frames.
- Set frame width, height, start position, frame count, frame delay, direction, and loop.
- Preview and download the generated GIF.
- Supports upload, drag & drop, or paste image input.
- Runs with Node.js and Express.

## Requirements

- Node.js 18+ (or compatible runtime)

## Install

From the project folder:

```bash
npm install
```

## Run locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Render.com deployment

For Render, use a `Web Service` with these settings:

- Environment: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

If Render still asks for a build command, `npm install` is the correct value for this project.

## Notes

- The app saves uploaded images in `uploads/` and GIF outputs in `outputs/`.
- `uploads/` and `outputs/` must be writable by the server.
- Animated GIF generation is handled directly in Node, so ImageMagick is not required.

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

This project is intended for local or small-scale use. If you deploy it publicly, add stricter validation, authentication, rate limits, and cleanup jobs.
