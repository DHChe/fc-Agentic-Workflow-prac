import ReactMarkdown from "react-markdown";

import { cn } from "@/lib/utils";

export const DISALLOWED_ELEMENTS: readonly string[] = ["a", "img"];
export const UNWRAP_DISALLOWED = true;

export function ReportMarkdown(props: {
  markdown: string;
  streaming?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "max-w-[720px] text-body text-foreground",
        "[&_h1]:mt-7 [&_h1]:text-h1 [&_h1]:text-strong [&_h1:first-child]:mt-0",
        "[&_h2]:mt-7 [&_h2]:text-h2 [&_h2]:text-strong [&_h2:first-child]:mt-0",
        "[&_h3]:mt-5 [&_h3]:text-h3 [&_h3]:text-strong [&_h3:first-child]:mt-0",
        "[&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_p]:mt-3 [&_p:first-child]:mt-0 [&_strong]:font-semibold [&_strong]:text-strong",
        "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5",
      )}
    >
      <ReactMarkdown
        disallowedElements={DISALLOWED_ELEMENTS}
        unwrapDisallowed={UNWRAP_DISALLOWED}
      >
        {props.markdown}
      </ReactMarkdown>
      {props.streaming ? (
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-[1em] w-0.5 animate-pulse bg-primary align-[-0.15em]"
        />
      ) : null}
    </div>
  );
}
