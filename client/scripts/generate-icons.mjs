// Generates square app icons from the Chomnenh wordmark (the "C" monogram).
// Run from client/: node scripts/generate-icons.mjs
// Outputs: app/icon.png, app/apple-icon.png, public/images/chomnenh-mark.png, public/favicon.ico
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const SRC = "public/images/Chomnenh-logo.png";
const BG = "#ffffff";

// Wrap a single PNG in an ICO container (modern browsers accept PNG-in-ICO).
function pngToIco(png, size) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header[6] = size; // width
  header[7] = size; // height
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // data offset
  return Buffer.concat([header, png]);
}

const roundedMask = (size, radius) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`
  );

// Crop the "C" glyph out of the wordmark (width 277 stops just before the "h"
// stem), then trim to its bounds. Two passes: sharp runs trim before extract
// inside a single pipeline.
const cropped = await sharp(SRC)
  .extract({ left: 0, top: 0, width: 277, height: 420 })
  .toBuffer();
const glyphBounds = await sharp(cropped).trim().toBuffer();

const glyph = await sharp(glyphBounds)
  .resize(310, 310, { fit: "inside" })
  .toBuffer();
const { width: gw } = await sharp(glyph).metadata();

// Monogram: the C plus the wordmark's orange dot floating at its opening.
const dot = Buffer.from(
  `<svg width="80" height="80"><circle cx="40" cy="40" r="36" fill="#FFA040"/></svg>`
);
const glyphLeft = Math.round((512 - gw) / 2) - 24;
const square = await sharp({
  create: { width: 512, height: 512, channels: 4, background: BG },
})
  .composite([
    { input: glyph, left: glyphLeft, top: 116 },
    { input: dot, left: 372, top: 96 },
  ])
  .png()
  .toBuffer();

const rounded = await sharp(square)
  .composite([{ input: roundedMask(512, 100), blend: "dest-in" }])
  .png()
  .toBuffer();

await writeFile("app/icon.png", rounded);
await writeFile("public/images/chomnenh-mark.png", rounded);
await sharp(square).resize(180, 180).png().toFile("app/apple-icon.png");

const fav32 = await sharp(rounded).resize(32, 32).png().toBuffer();
await writeFile("public/favicon.ico", pngToIco(fav32, 32));

// White wordmark for dark surfaces: recolor the teal glyphs to white, keep the
// orange dot (teal has R≈42, orange R=255, so split on the red channel).
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] > 0 && data[i] < 150) {
    data[i] = data[i + 1] = data[i + 2] = 255;
  }
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile("public/images/Chomnenh-logo-white.png");

console.log(
  "Icons written: app/icon.png, app/apple-icon.png, public/images/chomnenh-mark.png, public/images/Chomnenh-logo-white.png, public/favicon.ico"
);
