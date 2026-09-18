"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type * as React from "react";

import {
  nextTickAction,
  POLL_INTERVAL_MS,
  shouldPoll,
} from "@/components/dashboard/polling";
import type { DashboardResponse } from "@/lib/api-types";

type DashboardDataValue = {
  data: DashboardResponse | null;
  month: string | null;
  setMonth: (month: string) => void;
  refresh: () => Promise<DashboardResponse | null>;
  limitReached: boolean;
  loading: boolean;
};

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

export function DashboardDataProvider(props: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [month, setDisplayedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(false);
  const redirectingRef = useRef(false);
  const selectedMonthRef = useRef<string | null>(null);
  const selectionVersionRef = useRef(0);
  const inFlightRef = useRef<Promise<DashboardResponse | null> | null>(null);
  const hasProcessingRef = useRef(false);

  const refresh = useCallback((): Promise<DashboardResponse | null> => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const selectedMonth = selectedMonthRef.current;
    const selectionVersion = selectionVersionRef.current;
    const url = selectedMonth
      ? `/api/dashboard?month=${encodeURIComponent(selectedMonth)}`
      : "/api/dashboard";

    if (mountedRef.current) {
      setLoading(true);
    }

    const request = (async (): Promise<DashboardResponse | null> => {
      try {
        const response = await fetch(url, { cache: "no-store" });

        if (response.status === 401) {
          redirectingRef.current = true;
          hasProcessingRef.current = false;
          const currentPath = `${window.location.pathname}${window.location.search}`;
          // The polling contract requires an immediate hard redirect on 401.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(
            `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`,
          );
          return null;
        }

        if (!response.ok) {
          return null;
        }

        const nextData = (await response.json()) as DashboardResponse;

        if (
          !mountedRef.current ||
          selectionVersion !== selectionVersionRef.current
        ) {
          return nextData;
        }

        hasProcessingRef.current = shouldPoll(nextData.documents);
        setData(nextData);
        setDisplayedMonth(nextData.month);
        return nextData;
      } catch {
        return null;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    })();

    inFlightRef.current = request;
    void request.finally(() => {
      if (inFlightRef.current === request) {
        inFlightRef.current = null;
      }
    });

    return request;
  }, []);

  const setMonth = useCallback(
    (nextMonth: string): void => {
      selectionVersionRef.current += 1;
      selectedMonthRef.current = nextMonth;
      setDisplayedMonth(nextMonth);

      const currentRequest = inFlightRef.current;
      void (async () => {
        if (currentRequest) {
          await currentRequest;
        }

        if (
          mountedRef.current &&
          selectedMonthRef.current === nextMonth &&
          !redirectingRef.current
        ) {
          await refresh();
        }
      })();
    },
    [refresh],
  );

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const hasProcessing = shouldPoll(data?.documents ?? []);

  useEffect(() => {
    hasProcessingRef.current = hasProcessing;

    if (!hasProcessing || redirectingRef.current) {
      return;
    }

    const timer = window.setInterval(() => {
      const action = nextTickAction({
        inFlight: inFlightRef.current !== null,
        hasProcessing: hasProcessingRef.current,
      });

      if (action === "stop") {
        window.clearInterval(timer);
      } else if (action === "fetch") {
        void refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [hasProcessing, refresh]);

  const value: DashboardDataValue = {
    data,
    month,
    setMonth,
    refresh,
    limitReached: Boolean(data && data.usage.used >= data.usage.limit),
    loading,
  };

  return (
    <DashboardDataContext.Provider value={value}>
      {props.children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardDataValue {
  const context = useContext(DashboardDataContext);

  if (!context) {
    throw new Error("useDashboardData must be used within DashboardDataProvider");
  }

  return context;
}
