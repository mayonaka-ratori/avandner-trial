/**
 * qr.mjs — 体験版の URL の QR コードを作る
 *
 *   node scripts/qr.mjs            → qr.png とターミナル表示
 *   node scripts/qr.mjs <URL>      → 別 URL で作りたいとき
 */

import QRCode from "qrcode";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.argv[2] ?? "https://mayonaka-ratori.github.io/avandnar-trial/";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "qr.png");

await QRCode.toFile(out, url, {
  width: 1024,
  margin: 2,
  color: { dark: "#0b0a06", light: "#f5eddb" },
});

console.log(`QR を書き出しました: ${out}`);
console.log(`URL: ${url}`);
console.log(await QRCode.toString(url, { type: "terminal", small: true }));
