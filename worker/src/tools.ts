import { spawn } from "node:child_process";
import type { WorkerConfig } from "./types.js";

export interface ToolOutput {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
  durationMs: number;
}

export async function runTool({
  command,
  args,
  cwd,
  config,
  timeoutMs,
  extraEnv,
  acceptedExitCodes = [0],
}: {
  command: string;
  args: string[];
  cwd: string;
  config: WorkerConfig;
  timeoutMs?: number;
  extraEnv?: Record<string, string>;
  acceptedExitCodes?: number[];
}): Promise<ToolOutput> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        NO_COLOR: "1",
        SEMGREP_SEND_METRICS: "off",
        TRIVY_CACHE_DIR: process.env.TRIVY_CACHE_DIR,
        ...extraEnv,
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let killedForOutput = false;
    let killedForTimeout = false;
    const maxBytes = config.limits.resultBytes;
    const killProcessTree = () => {
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
          return;
        } catch {
          // Fall back to killing the direct child when the process group is gone.
        }
      }
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      killedForTimeout = true;
      killProcessTree();
    }, timeoutMs ?? config.limits.componentTimeoutMs);

    const capture = (destination: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxBytes) {
        killedForOutput = true;
        killProcessTree();
        return;
      }
      destination.push(chunk);
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      if (killedForOutput) {
        reject(new Error("scanner_result_size_limit"));
        return;
      }
      if (killedForTimeout) {
        reject(new Error("scanner_timeout"));
        return;
      }
      const exitCode = code ?? (signal ? 124 : 1);
      if (!acceptedExitCodes.includes(exitCode)) {
        const error = new Error(`scanner_exit_${exitCode}`);
        Object.assign(error, {
          stderrCode: Buffer.concat(stderr).toString("utf8").slice(0, 300).replace(/[^\x20-\x7e]/g, " "),
        });
        reject(error);
        return;
      }
      resolve({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        exitCode,
        durationMs: Date.now() - started,
      });
    });
  });
}
