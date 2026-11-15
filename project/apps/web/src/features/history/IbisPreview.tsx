import { useEffect, useRef, useState } from "react";
import { Alert, Box, Loader, Text } from "@mantine/core";
import { apiUrl, trackedFetch } from "../../api/client";
import { resolvePreviewUrl } from "../../config/paths";

export default function IbisPreview({
  jobId,
  name,
  version,
  token,
  onClose,
}: {
  jobId: string;
  name: string;
  version: "source" | "translated";
  token: string;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const configured =
    import.meta.env.VITE_PREVIEW_URL ||
    (import.meta.env.DEV ? "http://localhost:8081/" : "");
  const url = resolvePreviewUrl(configured, window.location.origin);
  const frameUrl = url?.href;
  const frameOrigin = url?.origin;
  useEffect(() => {
    if (!frameUrl || !frameOrigin) return;
    const abort = new AbortController();
    let sent = false;
    let timeout = window.setTimeout(() => {
      setError(
        "The spreadsheet preview service is unavailable. Start the preview service and try again.",
      );
      setLoading(false);
    }, 12000);
    const receive = async (event: MessageEvent) => {
      if (
        event.origin !== frameOrigin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (event.data?.source === "ibisoffice" && event.data.type === "close") {
        onClose();
        return;
      }
      if (event.data?.source !== "excel-translator-preview") return;
      if (event.data.type === "error") {
        setError(
          "ibisOffice could not start. Use a browser with WebGPU support and a secure connection.",
        );
        setLoading(false);
        window.clearTimeout(timeout);
        return;
      }
      if (event.data.type === "started") {
        setLoading(false);
        window.clearTimeout(timeout);
        return;
      }
      if (event.data.type !== "ready" || sent) return;
      sent = true;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        setError(
          "The spreadsheet preview is taking too long to start. Check WebGPU support and try again.",
        );
        setLoading(false);
      }, 120000);
      try {
        const response = await trackedFetch(
          apiUrl(
            `/jobs/${encodeURIComponent(jobId)}/preview-file?version=${version}`,
          ),
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: abort.signal,
          },
        );
        if (!response.ok)
          throw new Error("Could not load the authorized workbook.");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 50 * 1024 * 1024)
          throw new Error("Workbook exceeds the preview size limit.");
        if (!abort.signal.aborted)
          frame.current?.contentWindow?.postMessage(
            { source: "excel-translator", type: "workbook", name, bytes },
            frameOrigin,
            [bytes],
          );
      } catch (reason) {
        if (!abort.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load preview.",
          );
          setLoading(false);
          window.clearTimeout(timeout);
        }
      }
    };
    window.addEventListener("message", receive);
    return () => {
      abort.abort();
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [frameUrl, frameOrigin, jobId, name, version, token, onClose]);
  if (!frameUrl)
    return (
      <Alert color="blue">
        Configure the ibisOffice preview service to open the spreadsheet
        preview.
      </Alert>
    );
  return (
    <Box pos="relative">
      {error ? (
        <Alert color="orange" mb="sm" role="alert">
          {error}
        </Alert>
      ) : (
        loading && (
          <Text size="sm" c="dimmed" mb="sm">
            <Loader size={12} mr="xs" />
            Loading spreadsheet editor...
          </Text>
        )
      )}
      <iframe
        ref={frame}
        src={frameUrl}
        title={`${name} - spreadsheet preview`}
        referrerPolicy="origin"
        style={{
          width: "100%",
          height: "70vh",
          border: 0,
          borderRadius: 12,
          background: "white",
        }}
      />
    </Box>
  );
}
