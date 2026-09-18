import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MESSAGES } from "./messages";

function sliceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`문서 구간을 찾을 수 없습니다: ${start} ~ ${end}`);
  }

  return source.slice(startIndex, endIndex);
}

function tableLastColumn(section: string): string[] {
  const rows = section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .filter((line) => !/^\|[-|\s]+\|$/.test(line));

  return rows.slice(1).map((row) => {
    const cells = row.split("|").map((cell) => cell.trim());
    return cells.at(-2) ?? "";
  });
}

function deepStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(deepStrings);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(deepStrings);
  }

  return [];
}

describe("MESSAGES", () => {
  const userFlows = readFileSync(
    resolve(process.cwd(), "docs/USER_FLOWS.md"),
    "utf8",
  );
  const chapter7 = sliceSection(userFlows, "## 7.", "## 8.");
  const messageStrings = deepStrings(MESSAGES);

  it("USER_FLOWS 7.1~7.6과 7.9의 모든 고정 문구를 포함한다", () => {
    const sectionNumbers = ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.9"];
    const phrases = sectionNumbers.flatMap((number, index) => {
      const nextNumber = index === sectionNumbers.length - 1 ? "## 8." : `### ${
        number === "7.6" ? "7.7" : sectionNumbers[index + 1]
      }`;
      const section = sliceSection(
        `${chapter7}\n## 8.`,
        `### ${number}`,
        nextNumber,
      );

      return tableLastColumn(section).flatMap((phrase) =>
        phrase.includes(" / ") ? phrase.split(" / ") : phrase,
      );
    });

    expect(phrases).not.toHaveLength(0);
    expect(phrases.filter((phrase) => !messageStrings.includes(phrase))).toEqual([]);
  });

  it("USER_FLOWS 7.8의 라벨을 모두 포함하고 사용량을 숫자로 만든다", () => {
    const labels = tableLastColumn(
      sliceSection(chapter7, "### 7.8", "### 7.9"),
    )
      .flatMap((value) => value.split(" · "))
      .map((value) => value.replace(/\s*\[G-\d+]\s*$/, ""))
      .filter((value) => value !== "오늘 사용 n/50");

    expect(labels).not.toHaveLength(0);
    expect(labels.filter((label) => !messageStrings.includes(label))).toEqual([]);
    expect(MESSAGES.label.usage(3)).toBe("오늘 사용 3/50");
  });

  it("design.md 12.1의 랜딩 제목과 일치한다", () => {
    const design = readFileSync(resolve(process.cwd(), "docs/design.md"), "utf8");
    const landingSection = sliceSection(design, "### 12.1", "### 12.2");
    const titleRow = landingSection
      .split("\n")
      .find((line) => line.startsWith("| 제목(display) |"));

    if (!titleRow) {
      throw new Error("design.md 12.1에서 랜딩 제목을 찾을 수 없습니다.");
    }

    const title = titleRow.split("|").map((cell) => cell.trim()).at(-2);
    expect(MESSAGES.landing.title).toBe(title);
  });
});
