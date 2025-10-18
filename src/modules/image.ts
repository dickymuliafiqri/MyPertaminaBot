import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** Opsi perbandingan untuk Pixelmatch. */
export interface CompareOptions {
  /** Paksa ukuran target (akan me-resize kedua gambar ke width x height). */
  width?: number;
  height?: number;
  /** Semakin kecil semakin ketat. Default: 0.1 */
  threshold?: number;
  /** Hitung anti-aliasing sebagai perbedaan. Default: true */
  includeAA?: boolean;
  /** Jika true, kembalikan diff PNG sebagai Buffer. Default: false */
  returnDiff?: boolean;
  /**
   * Strategi resize saat menyamakan ukuran.
   * "cover" menjaga proporsi dan crop sisi yang berlebih (default),
   * "contain" menjaga seluruh gambar terlihat (akan ada padding transparan),
   * "fill" mengabaikan rasio (bisa distorsi).
   */
  fit?: "cover" | "contain" | "fill";
}

/** Hasil perbandingan Pixelmatch. */
export interface CompareResult {
  /** Persentase kemiripan 0..100 (semakin besar semakin mirip). */
  percent: number;
  /** Lebar/tinggi gambar yang dibandingkan (setelah normalisasi). */
  width: number;
  height: number;
  /** Jumlah piksel yang berbeda (raw count). */
  diffCount: number;
  /** Buffer PNG berisi peta perbedaan (jika returnDiff = true). */
  diff?: Buffer;
}

/**
 * Bandingkan dua gambar dari Buffer menggunakan Pixelmatch.
 * - Jika width/height tidak diberikan, fungsi memakai ukuran asli gambar A dan meresize B agar sama.
 * - Gambar dinormalisasi menjadi RGBA 8-bit per channel (4 channel).
 */
export async function comparePixelmatchBuffers(
  bufA: Buffer | Uint8Array,
  bufB: Buffer | Uint8Array,
  opts: CompareOptions = {},
): Promise<CompareResult> {
  const {
    width,
    height,
    threshold = 0.1,
    includeAA = true,
    returnDiff = false,
    fit = "cover",
  } = opts;

  // Baca metadata A untuk fallback ukuran target
  const aMeta = await sharp(bufA).metadata();
  if (!aMeta.width || !aMeta.height) {
    throw new Error(
      "Gambar A tidak memiliki metadata width/height yang valid.",
    );
  }
  const targetW = width ?? aMeta.width;
  const targetH = height ?? aMeta.height;

  // Helper: konversi ke RGBA raw (Uint8Array) dengan ukuran target
  const toRGBA = async (
    input: Buffer | Uint8Array,
    w: number,
    h: number,
  ): Promise<{ data: Uint8Array; w: number; h: number }> => {
    const pipeline = sharp(input).resize(w, h, { fit });
    const { data, info } = await pipeline
      .removeAlpha()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  };

  const [A, B] = await Promise.all([
    toRGBA(bufA, targetW, targetH),
    toRGBA(bufB, targetW, targetH),
  ]);

  const outPNG = returnDiff ? new PNG({ width: A.w, height: A.h }) : null;

  const diffCount = pixelmatch(
    A.data as unknown as Buffer, // pixelmatch menerima Buffer/Uint8Array
    B.data as unknown as Buffer,
    outPNG ? (outPNG.data as unknown as Buffer) : undefined,
    A.w,
    A.h,
    { threshold, includeAA },
  );

  const total = A.w * A.h;
  const percent = (1 - diffCount / total) * 100;

  return {
    percent,
    width: A.w,
    height: A.h,
    diffCount,
    diff: returnDiff && outPNG ? PNG.sync.write(outPNG) : undefined,
  };
}

export default comparePixelmatchBuffers;
