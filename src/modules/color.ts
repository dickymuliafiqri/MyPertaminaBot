import sharp from "sharp";

/** Opsi perhitungan warna dominan */
interface DominantOptions {
  sampleSize?: number; // downscale agar cepat
  ignoreBelow?: number; // buang piksel sangat gelap (0..255)
  ignoreAbove?: number; // buang piksel sangat terang (0..255)
  ignoreNearGray?: boolean; // buang piksel nyaris abu-abu
  grayTolerance?: number; // toleransi abu-abu (default 10)
  topK?: number; // jika ingin palet teratas
}

interface RGB {
  r: number;
  g: number;
  b: number;
}
interface DominantResult {
  dominant: RGB & { hex: string };
  top?: Array<{ color: RGB & { hex: string }; count: number }>;
  totalCount: number;
}

const toHex = (n: number) => n.toString(16).padStart(2, "0");
const rgbToHex = (r: number, g: number, b: number) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

// Kuantisasi 5-bit per kanal (32×32×32 bucket) — stabil & cepat
const bucketKey = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
const bucketCenter = (v5: number) => (v5 << 3) | 0b0011;

/** Hitung warna dominan dari buffer gambar (PNG/JPEG/WebP, dll.) */
export async function dominantColorFromImageBuffer(
  imageBuf: Buffer | Uint8Array,
  { sampleSize = 120, ignoreBelow, ignoreAbove, ignoreNearGray = false, grayTolerance = 10, topK }: DominantOptions = {}
): Promise<DominantResult> {
  const { data } = await sharp(imageBuf)
    .resize(sampleSize, sampleSize, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .ensureAlpha()
    .raw({ depth: "uchar" })
    .toBuffer({ resolveWithObject: true });

  const counts = new Map<number, number>();
  let total = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];

    if (ignoreBelow !== undefined && r < ignoreBelow && g < ignoreBelow && b < ignoreBelow) continue;
    if (ignoreAbove !== undefined && r > ignoreAbove && g > ignoreAbove && b > ignoreAbove) continue;
    if (ignoreNearGray && Math.abs(r - g) < grayTolerance && Math.abs(g - b) < grayTolerance) continue;

    const key = bucketKey(r, g, b);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }

  if (total === 0 || counts.size === 0) {
    // fallback rata-rata sederhana (jarang terjadi)
    const avg = await averageColor(imageBuf);
    return { dominant: { ...avg, hex: rgbToHex(avg.r, avg.g, avg.b) }, totalCount: 0 };
  }

  // Ambil bucket terpadat
  let maxKey = 0,
    maxCount = -1;
  counts.forEach((c, k) => {
    if (c > maxCount) {
      maxCount = c;
      maxKey = k;
    }
  });

  const R5 = (maxKey >> 10) & 31,
    G5 = (maxKey >> 5) & 31,
    B5 = maxKey & 31;
  const r = bucketCenter(R5),
    g = bucketCenter(G5),
    b = bucketCenter(B5);
  const hex = rgbToHex(r, g, b);

  let top: DominantResult["top"];
  if (topK && topK > 1) {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK);
    top = sorted.map(([k, c]) => {
      const r5 = (k >> 10) & 31,
        g5 = (k >> 5) & 31,
        b5 = k & 31;
      const rr = bucketCenter(r5),
        gg = bucketCenter(g5),
        bb = bucketCenter(b5);
      return { color: { r: rr, g: gg, b: bb, hex: rgbToHex(rr, gg, bb) }, count: c };
    });
  }

  return { dominant: { r, g, b, hex }, top, totalCount: total };
}

/** Fallback rata-rata */
async function averageColor(imageBuf: Buffer | Uint8Array): Promise<RGB> {
  const { data } = await sharp(imageBuf)
    .resize(64, 64, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .ensureAlpha()
    .toColorspace("rgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}
