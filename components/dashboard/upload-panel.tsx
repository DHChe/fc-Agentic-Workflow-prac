"use client";

import { useAuth } from "@clerk/nextjs";
import { upload } from "@vercel/blob/client";
import { Upload as UploadIcon } from "lucide-react";
import { useRef, useState } from "react";

import { useDashboardData } from "@/components/dashboard/dashboard-data";
import {
  buildUploadPath,
  pickUploadError,
} from "@/components/dashboard/upload-helpers";
import { NoticeLine } from "@/components/notice-line";
import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/lib/messages";
import {
  checkClientFile,
  extFromContentType,
} from "@/lib/upload/validate";

const ACCEPTED_FILES =
  ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

type UploadError = "limitReached" | "failed" | null;

const fileSizeFormatter = new Intl.NumberFormat("ko-KR");

function fileIssueMessage(file: File | null): string | null {
  if (!file) {
    return null;
  }

  const issue = checkClientFile(file);
  return issue === null ? null : MESSAGES.upload[issue];
}

export function UploadPanel(): React.JSX.Element {
  const { userId } = useAuth();
  const { limitReached, refresh } = useDashboardData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<UploadError>(null);
  const [uploaded, setUploaded] = useState(false);
  const selectedFileIssue = fileIssueMessage(selectedFile);

  async function showUploadFailure(): Promise<void> {
    const fresh = await refresh();

    if (!fresh) {
      setUploadError("failed");
      return;
    }

    setUploadError(
      pickUploadError(fresh.usage.used, fresh.usage.limit),
    );
  }

  async function submitFile(getFile: () => Promise<File>): Promise<void> {
    if (!userId || uploading || limitReached) {
      return;
    }

    setUploading(true);
    setProgress(0);
    setUploadError(null);
    setUploaded(false);

    try {
      const file = await getFile();
      setSelectedFile(file);

      if (checkClientFile(file) !== null) {
        return;
      }

      const ext = extFromContentType(file.type);

      if (!ext) {
        return;
      }

      const pathname = buildUploadPath(userId, crypto.randomUUID(), ext);
      const result = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: ({ percentage }) => {
          setProgress(Math.min(100, Math.max(0, percentage)));
        },
      });

      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: result.url, fileName: file.name }),
      });

      if (response.status !== 201) {
        throw new Error("document creation failed");
      }

      setSelectedFile(null);
      setProgress(null);
      setUploaded(true);

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      await refresh();
    } catch {
      await showUploadFailure();
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): void {
    setSelectedFile(event.currentTarget.files?.[0] ?? null);
    setUploadError(null);
    setUploaded(false);
    setProgress(null);
  }

  function handleUpload(): void {
    if (!selectedFile || selectedFileIssue) {
      return;
    }

    void submitFile(async () => selectedFile);
  }

  function handleSample(): void {
    void submitFile(async () => {
      const response = await fetch("/samples/receipt-sample.jpg");

      if (!response.ok) {
        throw new Error("sample fetch failed");
      }

      return new File([await response.blob()], "receipt-sample.jpg", {
        type: "image/jpeg",
      });
    });
  }

  const controlsDisabled = uploading || limitReached || !userId;
  const submitDisabled =
    controlsDisabled || !selectedFile || selectedFileIssue !== null;
  const uploadErrorMessage =
    uploadError === "limitReached"
      ? MESSAGES.api.limitReached
      : uploadError === "failed"
        ? MESSAGES.upload.failed
        : selectedFileIssue;

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-[7px] bg-sunken p-4 sm:flex-row sm:items-center sm:justify-between">
        <label
          className="flex min-h-[38px] min-w-0 flex-1 cursor-pointer items-center gap-3 text-body text-muted-foreground"
          htmlFor="dashboard-upload-input"
        >
          <UploadIcon
            aria-hidden="true"
            className="size-6 shrink-0 text-primary"
            strokeWidth={2}
          />
          {selectedFile ? (
            <span className="min-w-0">
              <span className="block truncate font-medium text-strong">
                {selectedFile.name}
              </span>
              <span className="block text-caption tabular-nums">
                {fileSizeFormatter.format(selectedFile.size)}바이트
              </span>
            </span>
          ) : (
            <span>{MESSAGES.ui.uploadPrompt}</span>
          )}
        </label>

        <input
          ref={inputRef}
          accept={ACCEPTED_FILES}
          className="sr-only"
          data-testid="upload-input"
          disabled={uploading}
          id="dashboard-upload-input"
          onChange={handleFileChange}
          type="file"
        />

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            className="w-full sm:w-auto"
            data-testid="upload-submit"
            disabled={submitDisabled}
            onClick={handleUpload}
            type="button"
          >
            {MESSAGES.label.button.upload}
          </Button>
          <Button
            className="w-full sm:w-auto"
            data-testid="upload-sample"
            disabled={controlsDisabled}
            onClick={handleSample}
            type="button"
            variant="secondary"
          >
            {MESSAGES.label.button.sample}
          </Button>
        </div>
      </div>

      {uploading && progress !== null ? (
        <div
          aria-label={MESSAGES.ui.section.upload}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(progress)}
          className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-muted"
          data-testid="upload-progress"
          role="progressbar"
        >
          <div
            className="h-full bg-primary transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      <p className="mt-2 text-caption text-muted-foreground">
        {MESSAGES.ui.uploadLimits}
      </p>

      {limitReached ? (
        uploadError === "limitReached" ? (
          <div className="mt-2" data-testid="upload-error">
            <NoticeLine data-testid="limit-notice" tone="warn">
              {MESSAGES.api.limitReached}
            </NoticeLine>
          </div>
        ) : (
          <NoticeLine
            className="mt-2"
            data-testid="limit-notice"
            tone="warn"
          >
            {MESSAGES.api.limitReached}
          </NoticeLine>
        )
      ) : uploadErrorMessage ? (
        <NoticeLine
          className="mt-2"
          data-testid="upload-error"
          tone="error"
        >
          {uploadErrorMessage}
        </NoticeLine>
      ) : uploaded ? (
        <NoticeLine className="mt-2" tone="info">
          {MESSAGES.ui.uploadDone}
        </NoticeLine>
      ) : null}
    </div>
  );
}
