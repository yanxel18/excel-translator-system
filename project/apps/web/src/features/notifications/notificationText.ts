import type { JobNotification } from "../../api";

export function notificationText(item: JobNotification, t: (message: string) => string) {
  const file = item.eventFileName;
  const withFile = (template: string, generic: string) =>
    file ? t(template).replace("{file}", () => file) : t(generic);

  switch (item.eventKey) {
    case "job.queued":
      if (item.type === "JOB_QUEUED") return { title: t("Translation queued"), message: t("Your workbook is ready to start.") };
      break;
    case "job.started":
      if (item.type === "JOB_PROGRESS") return { title: t("Translation started"), message: withFile("{file} is being translated.", "Your workbook is being translated.") };
      break;
    case "job.completed":
      if (item.type === "JOB_COMPLETED") return { title: t("Translation complete"), message: t("Your translated workbook is ready to download.") };
      break;
    case "job.failed":
      if (item.type === "JOB_FAILED") return { title: t("Translation failed"), message: withFile("{file} could not be translated.", "Your workbook could not be translated.") };
      break;
    case "job.interrupted":
      if (item.type === "JOB_FAILED") return { title: t("Translation interrupted"), message: withFile("{file} can be retried after an API restart.", "Your workbook can be retried after an API restart.") };
      break;
    case "job.cancelled":
      if (item.type === "JOB_CANCELLED") return { title: t("Translation cancelled"), message: withFile("{file} was cancelled.", "Your workbook translation was cancelled.") };
      break;
  }
  return { title: item.title, message: item.message };
}
