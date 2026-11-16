import { open } from "node:fs/promises";

export async function openWorkbookFileStream(path: string) {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Workbook path is not a regular file.");
    return { stream: file.createReadStream(), size: stat.size };
  } catch (error) {
    await file.close();
    throw error;
  }
}
