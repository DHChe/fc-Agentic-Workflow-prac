import { MESSAGES } from "./messages";

const amountFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const ratioFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const seoulDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dateTimeParts(date: Date | string): Record<string, string> {
  return Object.fromEntries(
    seoulDateTimeFormatter
      .formatToParts(typeof date === "string" ? new Date(date) : date)
      .map(({ type, value }) => [type, value]),
  );
}

export function formatAmount(amount: number): string {
  return `${amountFormatter.format(amount)}원`;
}

export function formatRatio(ratio: number | null): string {
  return ratio === null
    ? MESSAGES.label.placeholder
    : ratioFormatter.format(ratio);
}

export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

export function formatDateTime(date: Date | string): string {
  const parts = dateTimeParts(date);
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatDate(date: Date | string): string {
  const parts = dateTimeParts(date);
  return `${parts.year}.${parts.month}.${parts.day}`;
}
