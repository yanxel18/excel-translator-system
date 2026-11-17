import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";

test("notification events switch language in the list and preview while legacy messages stay readable", async ({ page }) => {
  const common = { jobId: "job-1", createdAt: "2026-11-18T00:00:00.000Z" };
  const items = [
    { ...common, id: "queued", type: "JOB_QUEUED", eventKey: "job.queued", eventFileName: null, title: "Translation queued", message: "Your workbook is ready to start.", isRead: false },
    { ...common, id: "started", type: "JOB_PROGRESS", eventKey: "job.started", eventFileName: "report.xlsx", title: "Translation started", message: "report.xlsx is being translated.", isRead: true },
    { ...common, id: "completed", type: "JOB_COMPLETED", eventKey: "job.completed", eventFileName: null, title: "Translation complete", message: "Your translated workbook is ready to download.", isRead: true },
    { ...common, id: "failed", type: "JOB_FAILED", eventKey: "job.failed", eventFileName: null, title: "Translation failed", message: "old readable failure", isRead: true },
    { ...common, id: "interrupted", type: "JOB_FAILED", eventKey: "job.interrupted", eventFileName: "report.xlsx", title: "Translation interrupted", message: "report.xlsx can be retried after an API restart.", isRead: true },
    { ...common, id: "cancelled", type: "JOB_CANCELLED", eventKey: "job.cancelled", eventFileName: "report.xlsx", title: "Translation cancelled", message: "report.xlsx was cancelled.", isRead: true },
    { ...common, id: "unknown", type: "JOB_FAILED", eventKey: "future.event", eventFileName: "ignored.xlsx", title: "Custom legacy notice", message: "Keep this message.", isRead: true },
    { ...common, id: "mismatch", type: "JOB_COMPLETED", eventKey: "job.failed", eventFileName: "ignored.xlsx", title: "Mismatched notice", message: "Keep mismatched text.", isRead: true },
    { ...common, id: "legacy", type: "JOB_PROGRESS", eventKey: null, title: "Old notice", message: "Legacy text.", isRead: true },
  ];
  await page.addInitScript(() => localStorage.setItem("excel-translator-token", "notification-test"));
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    const body = path === "/profile" ? { id: "owner", username: "alice", isAdmin: false }
      : path === "/notifications" ? { data: items, total: items.length, nextCursor: null }
      : path === "/notifications/unread-count" ? { count: 1 } : [];
    await route.fulfill({ json: body });
  });
  await page.goto("/excel-convert/notifications");
  await expect(page.getByText("report.xlsx is being translated.")).toBeVisible();
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitem", { name: "日本語" }).click();
  await expect(page.getByText("翻訳を開始しました")).toBeVisible();
  await expect(page.getByText("report.xlsx を翻訳しています。")).toBeVisible();
  await expect(page.getByText("翻訳に失敗しました")).toBeVisible();
  await expect(page.getByText("ワークブックを翻訳できませんでした。")).toBeVisible();
  await expect(page.getByText("翻訳が中断されました")).toBeVisible();
  await expect(page.getByText("Custom legacy notice")).toBeVisible();
  await expect(page.getByText("Legacy text.")).toBeVisible();
  await page.getByRole("button", { name: "表示言語を変更" }).click();
  await page.getByRole("menuitem", { name: "中文" }).click();
  await expect(page.getByText("翻译已开始")).toBeVisible();
  await expect(page.getByText("正在翻译 report.xlsx。")).toBeVisible();
  await expect(page.getByText("翻译已取消")).toBeVisible();
  await expect(page.getByText("翻译已完成")).toBeVisible();
  await expect(page.getByText("无法翻译您的工作簿。")).toBeVisible();
  await expect(page.getByText("Mismatched notice")).toBeVisible();
  await expect(page.getByText("Keep mismatched text.")).toBeVisible();
  await page.getByRole("button", { name: "打开通知" }).click();
  await expect(page.getByRole("dialog", { name: "通知" }).getByText("翻译已加入队列")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "通知" }).getByText("最新", { exact: true })).toBeVisible();
});
