import { CATEGORY_KEYS, type CategoryKey } from "@/lib/categories";

const SEOUL_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/i;

function utcDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date;
}

function isValidDateTimeParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): boolean {
  const date = utcDate(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === millisecond
  );
}

function formatYear(year: number): string {
  return String(year).padStart(4, "0");
}

function parseMonth(month: string): { year: number; monthIndex: number } {
  if (!isValidMonth(month)) {
    throw new RangeError(`Invalid month: ${month}`);
  }

  const [year, monthNumber] = month.split("-").map(Number);
  return { year, monthIndex: monthNumber - 1 };
}

function shiftYearMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const totalMonths = year * 12 + monthIndex + delta;
  const shiftedYear = Math.floor(totalMonths / 12);
  const shiftedMonthIndex = totalMonths - shiftedYear * 12;

  return { year: shiftedYear, monthIndex: shiftedMonthIndex };
}

export function seoulDayStart(now: Date): Date {
  const seoulTime = new Date(now.getTime() + SEOUL_OFFSET_MILLISECONDS);
  const startAsUtc = utcDate(
    seoulTime.getUTCFullYear(),
    seoulTime.getUTCMonth(),
    seoulTime.getUTCDate(),
  );

  return new Date(startAsUtc.getTime() - SEOUL_OFFSET_MILLISECONDS);
}

export function seoulDateKey(date: Date): string {
  const seoulTime = new Date(date.getTime() + SEOUL_OFFSET_MILLISECONDS);
  const year = formatYear(seoulTime.getUTCFullYear());
  const month = String(seoulTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(seoulTime.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function currentSeoulMonth(now: Date): string {
  return seoulDateKey(now).slice(0, 7);
}

export function isValidMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function monthRange(month: string): { start: Date; end: Date } {
  const { year, monthIndex } = parseMonth(month);
  const nextMonth = shiftYearMonth(year, monthIndex, 1);

  return {
    start: new Date(
      utcDate(year, monthIndex, 1).getTime() - SEOUL_OFFSET_MILLISECONDS,
    ),
    end: new Date(
      utcDate(nextMonth.year, nextMonth.monthIndex, 1).getTime() -
        SEOUL_OFFSET_MILLISECONDS,
    ),
  };
}

export function shiftMonth(month: string, delta: number): string {
  if (!Number.isInteger(delta)) {
    throw new RangeError(`Month delta must be an integer: ${delta}`);
  }

  const parsed = parseMonth(month);
  const shifted = shiftYearMonth(parsed.year, parsed.monthIndex, delta);

  return `${formatYear(shifted.year)}-${String(shifted.monthIndex + 1).padStart(2, "0")}`;
}

export function parseTransactedAt(
  raw: string | null,
  uploadedAt: Date,
): { transactedAt: Date; dateEstimated: boolean } {
  if (raw === null) {
    return { transactedAt: uploadedAt, dateEstimated: true };
  }

  const dateMatch = DATE_PATTERN.exec(raw);
  if (dateMatch) {
    const [, rawYear, rawMonth, rawDay] = dateMatch;
    const year = Number(rawYear);
    const month = Number(rawMonth);
    const day = Number(rawDay);

    if (isValidDateTimeParts(year, month, day)) {
      return {
        transactedAt: new Date(
          utcDate(year, month - 1, day).getTime() -
            SEOUL_OFFSET_MILLISECONDS,
        ),
        dateEstimated: false,
      };
    }
  }

  const dateTimeMatch = DATE_TIME_PATTERN.exec(raw);
  if (dateTimeMatch) {
    const [
      ,
      rawYear,
      rawMonth,
      rawDay,
      rawHour,
      rawMinute,
      rawSecond = "0",
      rawFraction = "",
      offset,
    ] = dateTimeMatch;
    const year = Number(rawYear);
    const month = Number(rawMonth);
    const day = Number(rawDay);
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    const second = Number(rawSecond);
    const millisecond = Number(rawFraction.padEnd(3, "0").slice(0, 3));

    if (
      isValidDateTimeParts(
        year,
        month,
        day,
        hour,
        minute,
        second,
        millisecond,
      )
    ) {
      const parsed = offset
        ? new Date(raw)
        : new Date(
            utcDate(
              year,
              month - 1,
              day,
              hour,
              minute,
              second,
              millisecond,
            ).getTime() - SEOUL_OFFSET_MILLISECONDS,
          );

      if (!Number.isNaN(parsed.getTime())) {
        return { transactedAt: parsed, dateEstimated: false };
      }
    }
  }

  return { transactedAt: uploadedAt, dateEstimated: true };
}

export type StatRow = {
  totalAmount: number | null;
  isDuplicate: boolean;
  category: CategoryKey;
};

export type MonthStats = {
  total: number;
  count: number;
  categories: Array<{
    key: CategoryKey;
    amount: number;
    ratio: number | null;
  }>;
};

export function aggregateMonth(rows: StatRow[]): MonthStats {
  const categoryAmounts = new Map<CategoryKey, number>(
    CATEGORY_KEYS.map((key) => [key, 0]),
  );
  let total = 0;
  let count = 0;

  for (const row of rows) {
    if (row.isDuplicate || row.totalAmount === null) {
      continue;
    }

    total += row.totalAmount;
    count += 1;
    categoryAmounts.set(
      row.category,
      (categoryAmounts.get(row.category) ?? 0) + row.totalAmount,
    );
  }

  const categoryOrder = new Map<CategoryKey, number>(
    CATEGORY_KEYS.map((key, index) => [key, index]),
  );
  const categories = CATEGORY_KEYS.map((key) => {
    const amount = categoryAmounts.get(key) ?? 0;
    return {
      key,
      amount,
      ratio: total > 0 ? amount / total : null,
    };
  }).sort(
    (left, right) =>
      right.amount - left.amount ||
      (categoryOrder.get(left.key) ?? 0) -
        (categoryOrder.get(right.key) ?? 0),
  );

  return { total, count, categories };
}

export function pickDefaultMonth(
  latestTransactedAt: Date | null,
  now: Date,
): string {
  return latestTransactedAt
    ? currentSeoulMonth(latestTransactedAt)
    : currentSeoulMonth(now);
}

export async function getMonthStats(
  userId: string,
  month: string,
): Promise<MonthStats> {
  const [{ and, eq, gte, lt }, { getDb }, { transactions }] =
    await Promise.all([
      import("drizzle-orm"),
      import("@/lib/db/client"),
      import("@/lib/db/schema"),
    ]);
  const { start, end } = monthRange(month);
  const rows = await getDb()
    .select({
      totalAmount: transactions.totalAmount,
      isDuplicate: transactions.isDuplicate,
      category: transactions.category,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.transactedAt, start),
        lt(transactions.transactedAt, end),
      ),
    );

  return aggregateMonth(rows);
}

export async function getDefaultMonth(
  userId: string,
  now: Date,
): Promise<string> {
  const [
    { and, eq, isNotNull, lt, max },
    { getDb },
    { transactions },
  ] = await Promise.all([
    import("drizzle-orm"),
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
  ]);
  const tomorrowStart = new Date(
    seoulDayStart(now).getTime() + DAY_MILLISECONDS,
  );
  const [result] = await getDb()
    .select({ latestTransactedAt: max(transactions.transactedAt) })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.isDuplicate, false),
        isNotNull(transactions.totalAmount),
        lt(transactions.transactedAt, tomorrowStart),
      ),
    );

  return pickDefaultMonth(result?.latestTransactedAt ?? null, now);
}

export async function countReportableTransactions(
  userId: string,
  month: string,
): Promise<number> {
  const [{ and, count, eq, gte, isNotNull, lt }, { getDb }, { transactions }] =
    await Promise.all([
      import("drizzle-orm"),
      import("@/lib/db/client"),
      import("@/lib/db/schema"),
    ]);
  const { start, end } = monthRange(month);
  const [result] = await getDb()
    .select({ value: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.transactedAt, start),
        lt(transactions.transactedAt, end),
        eq(transactions.isDuplicate, false),
        isNotNull(transactions.totalAmount),
      ),
    );

  return result?.value ?? 0;
}
