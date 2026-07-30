/**
 * A minimal ZIP writer, STORE-only (no compression).
 *
 * No dependency, because there is nothing to gain from one: every file going in here is
 * a PNG, which is already DEFLATE-compressed internally. Re-deflating costs CPU and
 * typically *grows* the output by a fraction of a percent, so `STORE` is the right method
 * and the format then reduces to headers plus raw bytes.
 *
 * Deliberately not streaming or zip64: a full day is a dozen images and tens of
 * megabytes, comfortably inside a Blob.
 */

/** CRC-32, the checksum ZIP entries carry. Table built once, lazily. */
let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, which is what the ZIP header format predates its way into. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * TS 5.7 made `Uint8Array` generic over its backing buffer, and `BlobPart` only accepts
 * `ArrayBuffer`-backed views (a `SharedArrayBuffer` one cannot be transferred into a
 * Blob). Pinning the parameter here keeps that requirement at the API boundary instead of
 * forcing a defensive copy of every image at Blob-construction time.
 */
type Bytes = Uint8Array<ArrayBuffer>;

export interface ZipEntry {
  name: string;
  bytes: Bytes;
}

/**
 * Build a ZIP archive from entries already in memory.
 *
 * Names are used verbatim, so callers are responsible for keeping them filesystem-safe
 * and unique — see `safeName`.
 */
export function createZip(entries: ZipEntry[], now = new Date()): Blob {
  const { time, date } = dosDateTime(now);
  const encoder = new TextEncoder();
  const locals: Bytes[] = [];
  const centrals: Bytes[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // method: STORE
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed == uncompressed under STORE
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // no extra field
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory header
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // where this entry's local header lives
    central.set(nameBytes, 46);

    locals.push(local, entry.bytes);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}

/** `data:image/png;base64,…` → raw bytes. */
export function bytesFromDataUrl(dataUrl: string): Bytes {
  const comma = dataUrl.indexOf(',');
  const binary = atob(comma === -1 ? dataUrl : dataUrl.slice(comma + 1));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Strip anything that would upset a filesystem, and never produce an empty name. */
export function safeName(s: string): string {
  const cleaned = s
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'file';
}

/** Hand a Blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
