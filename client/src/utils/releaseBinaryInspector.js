const textDecoder = new TextDecoder('utf-8');

function toHex(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function sha256Hex(arrayBuffer) {
  if (!arrayBuffer || !globalThis.crypto?.subtle) {
    return null;
  }
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
  return toHex(hashBuffer);
}

function readAsciiName(bytes, offset, maxLen) {
  let name = '';
  for (let i = 0; i < maxLen && offset + i < bytes.length; i += 1) {
    const ch = bytes[offset + i];
    if (ch === 0) break;
    name += String.fromCharCode(ch);
  }
  return name;
}

export function extractPeFileVersion(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 64) {
    return null;
  }

  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Check DOS MZ signature ('MZ' = 0x5A4D little-endian)
  if (view.getUint16(0, true) !== 0x5a4d) {
    return null;
  }

  const peOffset = view.getUint32(0x3c, true);
  if (peOffset <= 0 || peOffset + 24 > arrayBuffer.byteLength) {
    return null;
  }

  // Check PE\0\0 signature
  if (view.getUint32(peOffset, true) !== 0x00004550) {
    return null;
  }

  const numberOfSections = view.getUint16(peOffset + 6, true);
  const sizeOfOptionalHeader = view.getUint16(peOffset + 20, true);
  const sectionsStart = peOffset + 24 + sizeOfOptionalHeader;

  let scanStart = 0;
  let scanEnd = arrayBuffer.byteLength;

  if (sectionsStart + numberOfSections * 40 <= arrayBuffer.byteLength) {
    for (let i = 0; i < numberOfSections; i += 1) {
      const secOffset = sectionsStart + i * 40;
      const secName = readAsciiName(bytes, secOffset, 8);
      if (secName === '.rsrc') {
        const rawSize = view.getUint32(secOffset + 16, true);
        const rawPtr = view.getUint32(secOffset + 20, true);
        if (rawPtr > 0 && rawSize > 52 && rawPtr + rawSize <= arrayBuffer.byteLength) {
          scanStart = rawPtr;
          scanEnd = rawPtr + rawSize;
        }
        break;
      }
    }
  }

  const findFixedFileInfo = (start, end, step) => {
    const limit = end - 52;
    for (let pos = start; pos <= limit; pos += step) {
      if (
        view.getUint32(pos, true) === 0xfeef04bd &&
        view.getUint32(pos + 4, true) === 0x00010000
      ) {
        const ms = view.getUint32(pos + 8, true);
        const ls = view.getUint32(pos + 12, true);
        const major = (ms >>> 16) & 0xffff;
        const minor = ms & 0xffff;
        const release = (ls >>> 16) & 0xffff;
        const build = ls & 0xffff;
        return `${major}.${minor}.${release}.${build}`;
      }
    }
    return null;
  };

  return (
    findFixedFileInfo(scanStart, scanEnd, 4) ||
    findFixedFileInfo(scanStart, scanEnd, 2) ||
    (scanStart !== 0 ? findFixedFileInfo(0, arrayBuffer.byteLength, 2) : null)
  );
}

async function decompressDeflateRaw(uint8Slice) {
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new Error('Browser tidak mendukung DecompressionStream untuk membaca arsip ZIP.');
  }
  const stream = new Blob([uint8Slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).arrayBuffer();
}

export async function inspectZipBuffer(arrayBuffer, appCategory) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const len = arrayBuffer.byteLength;

  if (len < 22) {
    throw new Error('Berkas ZIP terlalu kecil atau rusak.');
  }

  const minOffset = Math.max(0, len - 65557);
  let eocdOffset = -1;
  for (let pos = len - 22; pos >= minOffset; pos -= 1) {
    if (view.getUint32(pos, true) === 0x06054b50) {
      const commentLength = view.getUint16(pos + 20, true);
      if (pos + 22 + commentLength === len) {
        eocdOffset = pos;
        break;
      }
      if (eocdOffset === -1) {
        eocdOffset = pos;
      }
    }
  }

  if (eocdOffset < 0) {
    throw new Error('Header End-of-Central-Directory ZIP tidak ditemukan.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return {
      exeBuffer: null,
      exeFilename: null,
      containsConfigJson: false,
      entryCount: 0,
      warnings: ['Arsip ZIP64 terdeteksi; verifikasi versi otomatis dilewati.'],
    };
  }

  const entries = [];
  let cursor = cdOffset;
  const cdEnd = Math.min(len, cdOffset + cdSize);

  while (cursor + 46 <= cdEnd && view.getUint32(cursor, true) === 0x02014b50) {
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fnameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const fnameStart = cursor + 46;
    if (fnameStart + fnameLen > cdEnd) break;

    const fullName = textDecoder.decode(bytes.subarray(fnameStart, fnameStart + fnameLen));
    const baseName = (fullName.split(/[/\\]/).pop() || '').toLowerCase();

    entries.push({
      fullName,
      baseName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor = fnameStart + fnameLen + extraLen + commentLen;
  }

  const containsConfigJson = entries.some((entry) => entry.baseName === 'config.json');
  const exeCandidates = entries.filter(
    (entry) => entry.baseName.endsWith('.exe') && entry.baseName !== 'zenupdater.exe'
  );

  let preferredName = null;
  if (appCategory === 'zen_desktop') preferredName = 'zensystem.exe';
  else if (appCategory === 'zen_sync') preferredName = 'syncagentapp.exe';

  let targetEntry = preferredName
    ? exeCandidates.find((entry) => entry.baseName === preferredName)
    : null;

  if (!targetEntry && exeCandidates.length > 0) {
    targetEntry = exeCandidates.reduce((best, curr) =>
      curr.uncompressedSize > best.uncompressedSize ? curr : best
    );
  }

  const warnings = [];
  if (containsConfigJson) {
    warnings.push(
      'PERINGATAN KRITIS: File config.json ditemukan di dalam ZIP! Jangan sertakan config.json agar pengaturan database cabang tidak tertimpa.'
    );
  }

  if (!targetEntry) {
    return {
      exeBuffer: null,
      exeFilename: null,
      containsConfigJson,
      entryCount: entries.length,
      warnings,
    };
  }

  const lho = targetEntry.localHeaderOffset;
  if (lho + 30 > len || view.getUint32(lho, true) !== 0x04034b50) {
    warnings.push(`Header berkas ${targetEntry.fullName} di dalam ZIP tidak valid.`);
    return {
      exeBuffer: null,
      exeFilename: targetEntry.fullName,
      containsConfigJson,
      entryCount: entries.length,
      warnings,
    };
  }

  const lfNameLen = view.getUint16(lho + 26, true);
  const lfExtraLen = view.getUint16(lho + 28, true);
  const dataStart = lho + 30 + lfNameLen + lfExtraLen;
  const dataEnd = dataStart + targetEntry.compressedSize;

  if (dataEnd > len) {
    warnings.push(`Ukuran data terkompresi ${targetEntry.fullName} di ZIP melebihi batas berkas.`);
    return {
      exeBuffer: null,
      exeFilename: targetEntry.fullName,
      containsConfigJson,
      entryCount: entries.length,
      warnings,
    };
  }

  const payload = bytes.subarray(dataStart, dataEnd);
  let exeBuffer = null;

  if (targetEntry.compressionMethod === 0) {
    exeBuffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
  } else if (targetEntry.compressionMethod === 8) {
    exeBuffer = await decompressDeflateRaw(payload);
  } else {
    warnings.push(
      `Metode kompresi ZIP (${targetEntry.compressionMethod}) untuk ${targetEntry.fullName} belum didukung pembaca otomatis.`
    );
  }

  return {
    exeBuffer,
    exeFilename: targetEntry.fullName,
    containsConfigJson,
    entryCount: entries.length,
    warnings,
  };
}

export async function inspectReleaseFile(file, appCategory) {
  const lowerName = (file?.name || '').toLowerCase();
  const buffer = await file.arrayBuffer();
  const sha256 = await sha256Hex(buffer);

  if (lowerName.endsWith('.exe')) {
    const detectedVersion = extractPeFileVersion(buffer);
    return {
      sha256,
      exeSha256: sha256,
      detectedVersion,
      exeFilename: file.name,
      containsConfigJson: false,
      entryCount: 1,
      warnings: [],
    };
  }

  if (lowerName.endsWith('.zip')) {
    const zipInfo = await inspectZipBuffer(buffer, appCategory);
    let exeSha256 = null;
    let detectedVersion = null;
    if (zipInfo.exeBuffer) {
      exeSha256 = await sha256Hex(zipInfo.exeBuffer);
      detectedVersion = extractPeFileVersion(zipInfo.exeBuffer);
    }
    return {
      sha256,
      exeSha256,
      detectedVersion,
      exeFilename: zipInfo.exeFilename,
      containsConfigJson: zipInfo.containsConfigJson,
      entryCount: zipInfo.entryCount,
      warnings: zipInfo.warnings,
    };
  }

  return {
    sha256,
    exeSha256: null,
    detectedVersion: null,
    exeFilename: null,
    containsConfigJson: false,
    entryCount: 0,
    warnings: [],
  };
}
