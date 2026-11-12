export function normalizeUploadFilename(fileName: string): string {
  if (
    !fileName ||
    /[^\u0000-\u00ff]/.test(fileName) ||
    !/[^\u0000-\u007f]/.test(fileName)
  )
    return fileName;

  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  if (
    decoded.includes("\uFFFD") ||
    /[\u0000-\u001f\u007f-\u009f]/.test(decoded)
  )
    return fileName;
  return decoded;
}
