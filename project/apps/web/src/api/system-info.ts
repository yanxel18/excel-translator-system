import { request } from "./client";
import type { SystemInfo } from "./types";

export const SystemInfoApi = {
  async getSystemInfo(): Promise<SystemInfo> {
    const response = await request<unknown>(
      "/system/info",
      {},
      undefined,
      { silent: true },
    );
    if (
      typeof response !== "object" ||
      response === null ||
      !("year" in response) ||
      typeof response.year !== "number" ||
      !Number.isInteger(response.year) ||
      response.year < 1 ||
      response.year > 9999
    ) {
      throw new Error("System info response is invalid.");
    }
    return { year: response.year };
  },
};
