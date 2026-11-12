import { BadRequestException } from "@nestjs/common";
import JSZip = require("jszip");

const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10000;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x05054b50;

export async function openWorkbookArchive(
  buffer: Buffer,
  verifyCrc32 = false,
): Promise<JSZip> {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 22 ||
    buffer.readUInt32LE(0) !== 0x04034b50
  ) {
    throw new BadRequestException(
      "The upload is not a valid XLSX ZIP archive.",
    );
  }
  validateZipDirectory(buffer);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: verifyCrc32 });
  } catch {
    throw new BadRequestException("The XLSX archive is malformed or corrupt.");
  }
  if (!zip.file("xl/workbook.xml"))
    throw new BadRequestException("The archive is missing xl/workbook.xml.");
  return zip;
}

function validateZipDirectory(buffer: Buffer): void {
  const directoryEndRecord = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(directoryEndRecord + 4);
  const directoryDisk = buffer.readUInt16LE(directoryEndRecord + 6);
  const entriesOnDisk = buffer.readUInt16LE(directoryEndRecord + 8);
  const entryCount = buffer.readUInt16LE(directoryEndRecord + 10);
  const directorySize = buffer.readUInt32LE(directoryEndRecord + 12);
  const directoryOffset = buffer.readUInt32LE(directoryEndRecord + 16);
  const commentLength = buffer.readUInt16LE(directoryEndRecord + 20);

  if (
    directoryEndRecord + 22 + commentLength !== buffer.length ||
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0xffff ||
    directoryOffset === 0xffffffff ||
    directorySize === 0xffffffff ||
    entryCount > MAX_ZIP_ENTRIES ||
    directoryOffset + directorySize !== directoryEndRecord
  ) {
    throw new BadRequestException(
      "The XLSX archive exceeds ZIP safety limits or has a malformed directory.",
    );
  }

  const directoryEnd = directoryOffset + directorySize;
  const names = new Set<string>();
  let totalUncompressedBytes = 0;
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index++) {
    if (
      cursor + 46 > directoryEnd ||
      buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_ENTRY
    ) {
      throw new BadRequestException("The XLSX ZIP directory is malformed.");
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nextEntry = cursor + 46 + nameLength + extraLength + commentLength;

    if (
      nextEntry > directoryEnd ||
      (flags & 0x41) !== 0 ||
      ![0, 8].includes(compressionMethod)
    ) {
      throw new BadRequestException(
        "The XLSX archive contains an unsupported or malformed ZIP entry.",
      );
    }

    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (
      !name ||
      name.split("/").includes("..") ||
      name.startsWith("/") ||
      name.includes("\\") ||
      names.has(name)
    ) {
      throw new BadRequestException(
        "The XLSX archive contains an unsafe or duplicate path.",
      );
    }
    names.add(name);

    totalUncompressedBytes += uncompressedBytes;
    if (
      totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES ||
      (uncompressedBytes > 1024 * 1024 &&
        uncompressedBytes / Math.max(compressedBytes, 1) > 200)
    ) {
      throw new BadRequestException(
        "The XLSX archive exceeds the allowed expansion limit.",
      );
    }
    cursor = nextEntry;
  }

  if (cursor < directoryEnd) {
    const signatureLength =
      cursor + 6 <= directoryEnd &&
      buffer.readUInt32LE(cursor) === CENTRAL_DIRECTORY_SIGNATURE
        ? buffer.readUInt16LE(cursor + 4)
        : -1;
    if (signatureLength < 0 || cursor + 6 + signatureLength !== directoryEnd) {
      throw new BadRequestException("The XLSX ZIP directory is malformed.");
    }
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset--) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw new BadRequestException("The XLSX ZIP directory is missing.");
}
