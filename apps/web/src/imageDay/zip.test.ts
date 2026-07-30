import { describe, expect, it } from 'vitest';
import { bytesFromDataUrl, createZip, safeName } from './zip';

/**
 * These assert the archive is structurally a real ZIP, not just that the function
 * returned something. A malformed archive fails at the moment the user double-clicks it,
 * long after anything here could catch it — so the signatures, the entry count and the
 * central-directory offsets are all checked directly against the bytes.
 */

const bytes = (s: string) => new TextEncoder().encode(s);

async function readBack(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);
  // End-of-central-directory is the last 22 bytes when there's no archive comment.
  const eocd = buf.length - 22;
  return {
    buf,
    localSig: view.getUint32(0, true),
    eocdSig: view.getUint32(eocd, true),
    entryCount: view.getUint16(eocd + 8, true),
    centralSize: view.getUint32(eocd + 12, true),
    centralOffset: view.getUint32(eocd + 16, true),
  };
}

describe('createZip', () => {
  it('writes the local-header and end-of-central-directory signatures', async () => {
    const z = await readBack(createZip([{ name: 'a.txt', bytes: bytes('hello') }]));
    expect(z.localSig).toBe(0x04034b50);
    expect(z.eocdSig).toBe(0x06054b50);
  });

  it('records how many entries it actually holds', async () => {
    const z = await readBack(
      createZip([
        { name: 'a.png', bytes: bytes('one') },
        { name: 'b.png', bytes: bytes('two') },
        { name: 'c.txt', bytes: bytes('three') },
      ]),
    );
    expect(z.entryCount).toBe(3);
  });

  it('points the central directory at a real offset inside the file', async () => {
    const z = await readBack(
      createZip([
        { name: 'a.png', bytes: bytes('one') },
        { name: 'b.png', bytes: bytes('two') },
      ]),
    );
    // The central directory must start where the entry data ends, and its own header
    // must be there. Getting this wrong is the classic "archive is corrupt" bug.
    expect(new DataView(z.buf.buffer).getUint32(z.centralOffset, true)).toBe(0x02014b50);
    expect(z.centralOffset + z.centralSize + 22).toBe(z.buf.length);
  });

  it('stores payload bytes verbatim — STORE, not deflate', async () => {
    const payload = bytes('PNGDATA-NOT-COMPRESSED');
    const buf = new Uint8Array(await createZip([{ name: 'x.png', bytes: payload }]).arrayBuffer());
    // Entry data sits straight after the 30-byte local header plus the name.
    const start = 30 + 'x.png'.length;
    expect(buf.slice(start, start + payload.length)).toEqual(payload);
  });

  it('produces a valid, empty archive for no entries', async () => {
    const z = await readBack(createZip([]));
    expect(z.eocdSig).toBe(0x06054b50);
    expect(z.entryCount).toBe(0);
  });

  it('handles non-ASCII names without corrupting the offsets', async () => {
    // Names are UTF-8, so byte length differs from character length; the header stores
    // the byte length and the offsets must follow it.
    const z = await readBack(createZip([{ name: 'café-日本.png', bytes: bytes('x') }]));
    expect(new DataView(z.buf.buffer).getUint32(z.centralOffset, true)).toBe(0x02014b50);
    expect(z.centralOffset + z.centralSize + 22).toBe(z.buf.length);
  });
});

describe('bytesFromDataUrl', () => {
  it('decodes a base64 data URL to its bytes', () => {
    expect(bytesFromDataUrl('data:image/png;base64,aGVsbG8=')).toEqual(bytes('hello'));
  });

  it('accepts bare base64 with no data: prefix', () => {
    expect(bytesFromDataUrl('aGVsbG8=')).toEqual(bytes('hello'));
  });
});

describe('safeName', () => {
  it('strips path separators so an entry cannot escape the archive', () => {
    expect(safeName('../../etc/passwd')).not.toContain('/');
    expect(safeName('..\\windows')).not.toContain('\\');
  });

  it('turns spaces into hyphens and keeps it readable', () => {
    expect(safeName('Golden hour 17:28')).toBe('Golden-hour-1728');
  });

  it('never returns an empty name', () => {
    expect(safeName('///')).toBe('file');
    expect(safeName('')).toBe('file');
  });

  it('caps runaway lengths', () => {
    expect(safeName('x'.repeat(500)).length).toBeLessThanOrEqual(80);
  });
});
