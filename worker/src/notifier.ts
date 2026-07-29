import { createHmac } from "node:crypto";
import { log } from "./log.js";
import type { WorkerConfig } from "./types.js";

export type WorkerNotification = {
  type: "scan.started" | "scan.completed" | "scan.failed";
  scanId: string;
  projectId?: string;
  mode: "free" | "launch_pack" | "monitoring";
  verdict?: string;
  reportFingerprint?: string;
  findingCounts?: Record<string, number>;
  newHighCount?: number;
  regressionCount?: number;
  resolvedCount?: number;
  errorCode?: string;
};

function signature(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function notifyWebApp(config: WorkerConfig, event: WorkerNotification) {
  const body = JSON.stringify(event);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const response = await fetch(`${config.webAppUrl}/api/internal/worker-events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-reposec-worker-timestamp": timestamp,
          "x-reposec-worker-signature": `sha256=${signature(config.workerSharedSecret, timestamp, body)}`,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return true;
      log.warn("worker notification rejected", { type: event.type, scanId: event.scanId, status: response.status, attempt });
    } catch (error) {
      log.warn("worker notification failed", {
        type: event.type,
        scanId: event.scanId,
        attempt,
        error: error instanceof Error ? error.message : "notification_failed",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  return false;
}
