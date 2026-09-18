import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getModel, isTestMode } from "./client";

const originalTestMode = process.env.SLIPSCAN_TEST_MODE;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalModel = process.env.CLAUDE_MODEL;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("Claude 클라이언트 설정", () => {
  beforeEach(() => {
    delete process.env.SLIPSCAN_TEST_MODE;
    delete process.env.VERCEL_ENV;
    delete process.env.CLAUDE_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv("SLIPSCAN_TEST_MODE", originalTestMode);
    restoreEnv("VERCEL_ENV", originalVercelEnv);
    restoreEnv("CLAUDE_MODEL", originalModel);
  });

  it("테스트 모드 변수가 없으면 비활성화한다", () => {
    expect(isTestMode()).toBe(false);
  });

  it("SLIPSCAN_TEST_MODE가 1인 비운영 환경에서만 활성화한다", () => {
    process.env.SLIPSCAN_TEST_MODE = "1";

    expect(isTestMode()).toBe(true);
  });

  it("운영 환경에서는 SLIPSCAN_TEST_MODE=1도 무시한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.SLIPSCAN_TEST_MODE = "1";
    process.env.VERCEL_ENV = "production";

    expect(isTestMode()).toBe(false);
    expect(isTestMode()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each(["0", "true"])("SLIPSCAN_TEST_MODE=%s는 활성화하지 않는다", (value) => {
    process.env.SLIPSCAN_TEST_MODE = value;

    expect(isTestMode()).toBe(false);
  });

  it("모델 변수가 없거나 비어 있으면 Opus 5를 쓴다", () => {
    expect(getModel()).toBe("claude-opus-5");

    process.env.CLAUDE_MODEL = "";
    expect(getModel()).toBe("claude-opus-5");
  });

  it("CLAUDE_MODEL 값을 그대로 쓴다", () => {
    process.env.CLAUDE_MODEL = "claude-sonnet-5";

    expect(getModel()).toBe("claude-sonnet-5");
  });
});
