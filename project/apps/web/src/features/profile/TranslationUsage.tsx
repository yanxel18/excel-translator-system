import { Box, Paper, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { useState } from "react";
import type { Job } from "../../api";
import { useLocale } from "../shared/LocaleProvider";
import "./TranslationUsage.css";

type Usage = {
  inputCharacters: number;
  outputCharacters: number;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
};

const emptyUsage = (): Usage => ({
  inputCharacters: 0,
  outputCharacters: 0,
  inputTokensEstimate: 0,
  outputTokensEstimate: 0,
});

function isMeasured(job: Job): boolean {
  return job.inputCharacters != null && job.outputCharacters != null &&
    job.inputTokensEstimate != null && job.outputTokensEstimate != null;
}

function addUsage(total: Usage, job: Job): void {
  total.inputCharacters += job.inputCharacters ?? 0;
  total.outputCharacters += job.outputCharacters ?? 0;
  total.inputTokensEstimate += job.inputTokensEstimate ?? 0;
  total.outputTokensEstimate += job.outputTokensEstimate ?? 0;
}

export default function TranslationUsage({ jobs }: { jobs: Job[] }) {
  const { t, locale } = useLocale();
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [focusedDay, setFocusedDay] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const completed = jobs.filter((job) => job.status === "COMPLETED");
  const measured = completed.filter(isMeasured);
  const total = emptyUsage();
  measured.forEach((job) => addUsage(total, job));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const dayJobs = completed.filter((job) => {
      if (!job.completedAt) return false;
      const time = new Date(job.completedAt).getTime();
      return time >= date.getTime() && time < next.getTime();
    });
    const values = emptyUsage();
    const measuredDayJobs = dayJobs.filter(isMeasured);
    measuredDayJobs.forEach((job) => addUsage(values, job));
    return {
      date,
      values,
      missing: measuredDayJobs.length < dayJobs.length,
      unavailable: dayJobs.length > 0 && measuredDayJobs.length === 0,
    };
  });
  const cards = [
    { key: "inputCharacters" as const, label: t("Input characters") },
    { key: "outputCharacters" as const, label: t("Output characters") },
    { key: "inputTokensEstimate" as const, label: t("Estimated input tokens") },
    { key: "outputTokensEstimate" as const, label: t("Estimated output tokens") },
  ];
  const maxCharacters = Math.max(1, ...days.flatMap(({ values }) => [
    values.inputCharacters, values.outputCharacters,
  ]));
  const maxTokens = Math.max(1, ...days.flatMap(({ values }) => [
    values.inputTokensEstimate, values.outputTokensEstimate,
  ]));
  const x = (index: number) => 80 + index * 90;
  const y = (value: number, maximum: number) => 190 - (value / maximum) * 150;
  const tokenPath = (key: "inputTokensEstimate" | "outputTokensEstimate") => {
    let active = false;
    return days.map((day, index) => {
      if (day.unavailable) {
        active = false;
        return "";
      }
      const command = active ? "L" : "M";
      active = true;
      return `${command}${x(index)} ${y(day.values[key], maxTokens)}`;
    }).join(" ");
  };
  const format = (value: number) => value.toLocaleString(locale);
  const formatAxis = (value: number) => value.toLocaleString(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const activeIndex = hoveredDay ?? focusedDay ?? selectedDay;
  const activeDay = activeIndex === null ? null : days[activeIndex];
  const dateLabel = (date: Date) => date.toLocaleDateString(locale, {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <Paper component="section" aria-label={t("Translation usage")} withBorder radius="lg" p="lg">
      <Stack gap="md">
        <Box>
          <Text fw={700}>{t("Translation usage")}</Text>
          <Text size="sm" c="dimmed">
            {t("Usage is recorded for completed translations only. Tokens are estimates, not model usage.")}
          </Text>
          <Text size="sm" c="dimmed">
            {t("Selected text only; shared strings are counted once. Estimates use one token per four UTF-8 bytes. Older jobs may be unavailable.")}
          </Text>
        </Box>
        <SimpleGrid cols={{ base: 2, sm: 4 }} className="translation-usage-cards">
          {cards.map(({ key, label }) => (
            <Paper key={key} withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">{label}</Text>
              <Text fz={25} fw={700} mt="xs">
                {measured.length ? format(total[key]) : t("Not available")}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
        <Box>
          <Text fw={700}>{t("Translation usage over the last 7 days")}</Text>
          <Text size="sm" c="dimmed">{t("Daily totals by completion date; cards show all-time totals.")}</Text>
          <div className="translation-usage-legend">
            {cards.map(({ key, label }) => (
              <span key={key}><i aria-hidden="true" className={`usage-legend-${key}`} />{label}</span>
            ))}
          </div>
          <div className="translation-usage-axis-labels">
            <Text size="sm">{t("Characters scale")}</Text>
            <Text size="sm">{t("Estimated tokens scale")}</Text>
          </div>
          <div className="translation-usage-scroll" role="region" aria-label={t("Translation usage chart")} tabIndex={0}>
            <div className="translation-usage-plot">
            <svg className="translation-usage-chart" viewBox="0 0 700 225" role="img" aria-label={t("Translation usage over the last 7 days")}>
              {[0, 0.5, 1].map((fraction) => {
                const lineY = 190 - fraction * 150;
                return (
                  <g key={fraction}>
                    <line x1="50" x2="650" y1={lineY} y2={lineY} className="usage-gridline" />
                    <text x="44" y={lineY + 4} textAnchor="end">{formatAxis(maxCharacters * fraction)}</text>
                    <text x="656" y={lineY + 4}>{formatAxis(maxTokens * fraction)}</text>
                  </g>
                );
              })}
              {days.map((day, index) => (
                <g key={day.date.toISOString()}>
                  {!day.unavailable && <>
                    <rect x={x(index) - 16} y={y(day.values.inputCharacters, maxCharacters)} width="14" height={190 - y(day.values.inputCharacters, maxCharacters)} className="usage-bar-input" />
                    <rect x={x(index) + 2} y={y(day.values.outputCharacters, maxCharacters)} width="14" height={190 - y(day.values.outputCharacters, maxCharacters)} className="usage-bar-output" />
                  </>}
                  <text x={x(index)} y="213" textAnchor="middle">
                    {day.date.toLocaleDateString(locale, { month: "short", day: "numeric" })}{day.missing ? "*" : ""}
                  </text>
                </g>
              ))}
              <path d={tokenPath("inputTokensEstimate")} className="usage-line-input" />
              <path d={tokenPath("outputTokensEstimate")} className="usage-line-output" />
              {days.map((day, index) => !day.unavailable && (
                <g key={day.date.toISOString()}>
                  <circle cx={x(index)} cy={y(day.values.inputTokensEstimate, maxTokens)} r="3.5" className="usage-point-input" />
                  <rect x={x(index) - 3} y={y(day.values.outputTokensEstimate, maxTokens) - 3} width="6" height="6" className="usage-point-output" />
                </g>
              ))}
            </svg>
            {days.map((day, index) => (
              <button
                key={day.date.toISOString()}
                type="button"
                className="usage-day-target"
                style={{ left: `${((x(index) - 45) / 700) * 100}%` }}
                aria-label={`${t("Show usage for")} ${dateLabel(day.date)}`}
                aria-pressed={selectedDay === index}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setHoveredDay(index);
                }}
                onPointerLeave={() => setHoveredDay(null)}
                onFocus={() => setFocusedDay(index)}
                onBlur={() => setFocusedDay(null)}
                onClick={() => setSelectedDay((current) => current === index ? null : index)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setHoveredDay(null);
                    setFocusedDay(null);
                    setSelectedDay(null);
                  }
                }}
              />
            ))}
            {activeDay && activeIndex !== null && (
              <div
                className="usage-day-details"
                role="region"
                aria-label={t("Daily usage details")}
                style={{ left: `clamp(0px, ${(x(activeIndex) / 700) * 100}%, calc(100% - 14rem))` }}
              >
                <Text fw={700} size="sm">{dateLabel(activeDay.date)}{activeDay.missing ? "*" : ""}</Text>
                {cards.map(({ key, label }) => (
                  <div className="usage-day-detail" key={key}>
                    <span>{label}</span>
                    <strong>{activeDay.unavailable ? t("Not available") : format(activeDay.values[key])}</strong>
                  </div>
                ))}
                {activeDay.missing && <Text size="xs">{t("* Some or all completed jobs on this day have no recorded usage.")}</Text>}
              </div>
            )}
            </div>
          </div>
          <Text size="sm" c="dimmed">{t("* Some or all completed jobs on this day have no recorded usage.")}</Text>
          <details className="translation-usage-details">
            <summary>{t("Show daily usage data")}</summary>
            <div className="translation-usage-scroll">
              <Table aria-label={t("Usage by completion date")} miw={700}>
                <Table.Thead><Table.Tr><Table.Th>{t("Date")}</Table.Th>{cards.map((card) => <Table.Th key={card.key}>{card.label}</Table.Th>)}</Table.Tr></Table.Thead>
                <Table.Tbody>
                  {days.map((day) => (
                    <Table.Tr key={day.date.toISOString()}>
                      <Table.Td>{day.date.toLocaleDateString(locale)}{day.missing ? "*" : ""}</Table.Td>
                      {cards.map(({ key }) => <Table.Td key={key}>{day.unavailable ? t("Not available") : format(day.values[key])}</Table.Td>)}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </details>
        </Box>
      </Stack>
    </Paper>
  );
}
