import { describe, expect, it } from "vitest";

import {
  createRefreshQueue,
  nextTickAction,
  POLL_INTERVAL_MS,
  shouldPoll,
} from "@/components/dashboard/polling";

describe("shouldPoll", () => {
  it("returns false for an empty document list", () => {
    expect(shouldPoll([])).toBe(false);
  });

  it("returns false when every document is settled", () => {
    expect(
      shouldPoll([{ status: "completed" }, { status: "failed" }]),
    ).toBe(false);
  });

  it("returns true when any document is processing", () => {
    expect(
      shouldPoll([{ status: "completed" }, { status: "processing" }]),
    ).toBe(true);
  });
});

describe("nextTickAction", () => {
  it("stops when there are no processing documents", () => {
    expect(
      nextTickAction({ inFlight: false, hasProcessing: false }),
    ).toBe("stop");
    expect(nextTickAction({ inFlight: true, hasProcessing: false })).toBe(
      "stop",
    );
  });

  it("skips when the previous request is still in flight", () => {
    expect(nextTickAction({ inFlight: true, hasProcessing: true })).toBe(
      "skip",
    );
  });

  it("fetches when processing remains and no request is in flight", () => {
    expect(nextTickAction({ inFlight: false, hasProcessing: true })).toBe(
      "fetch",
    );
  });
});

it("polls every four seconds", () => {
  expect(POLL_INTERVAL_MS).toBe(4000);
});

describe("createRefreshQueue", () => {
  function deferred(): {
    promise: Promise<string>;
    resolve: (value: string) => void;
  } {
    let resolve!: (value: string) => void;
    const promise = new Promise<string>((done) => {
      resolve = done;
    });

    return { promise, resolve };
  }

  it("진행 중인 요청이 없으면 바로 실행한다", async () => {
    const calls: number[] = [];
    const queue = createRefreshQueue(async () => {
      calls.push(calls.length);
      return "first";
    });

    await expect(queue.request()).resolves.toBe("first");
    expect(calls).toHaveLength(1);
  });

  it("진행 중인 요청에 올라타지 않고 그 뒤에 한 번 더 요청한다", async () => {
    const first = deferred();
    const second = deferred();
    const pending = [first, second];
    const queue = createRefreshQueue(async () => pending.shift()!.promise);

    const initial = queue.request();
    const afterWrite = queue.request();

    first.resolve("업로드 전 응답");
    second.resolve("업로드 후 응답");

    await expect(initial).resolves.toBe("업로드 전 응답");
    await expect(afterWrite).resolves.toBe("업로드 후 응답");
    expect(pending).toHaveLength(0);
  });

  it("진행 중에 여러 번 불러도 뒤따르는 요청은 한 번으로 합친다", async () => {
    const first = deferred();
    const second = deferred();
    const pending = [first, second];
    let started = 0;
    const queue = createRefreshQueue(async () => {
      started += 1;
      return pending.shift()!.promise;
    });

    void queue.request();
    const a = queue.request();
    const b = queue.request();

    first.resolve("1");
    second.resolve("2");

    await expect(a).resolves.toBe("2");
    await expect(b).resolves.toBe("2");
    expect(started).toBe(2);
  });

  it("요청이 끝나면 다시 한가해진다", async () => {
    const first = deferred();
    const queue = createRefreshQueue(async () => first.promise);

    const request = queue.request();
    expect(queue.isBusy()).toBe(true);

    first.resolve("done");
    await request;
    expect(queue.isBusy()).toBe(false);
  });
});
