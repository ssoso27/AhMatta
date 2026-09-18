import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const test = base.extend<{ isolatedApi: void }>({
    isolatedApi: [async ({}, use) => {
        const directory = await mkdtemp(join(tmpdir(), "ahmatta-e2e-"));
        const api = spawn(resolve(root, ".venv/bin/python"), ["frontend/e2e/server.py", join(directory, "test.db")], {
            cwd: root, stdio: ["ignore", "pipe", "pipe"],
        });
        let logs = "";
        api.stdout.on("data", chunk => { logs += chunk; });
        api.stderr.on("data", chunk => { logs += chunk; });
        const exited = new Promise<void>(resolveExit => api.once("close", () => resolveExit()));
        let startError: Error | undefined;
        api.on("error", error => { startError = error; });
        try {
            await expect.poll(async () => {
                if (startError) throw startError;
                if (api.exitCode !== null) throw new Error(`API exited: ${logs}`);
                if (!logs.includes("Uvicorn running on")) return false;
                try { return (await fetch("http://127.0.0.1:18742/api/health")).ok; }
                catch { return false; }
            }, { timeout: 15_000 }).toBe(true);
            await use();
        } finally {
            if (api.exitCode === null) api.kill("SIGTERM");
            const force = setTimeout(() => api.kill("SIGKILL"), 5_000);
            await exited;
            clearTimeout(force);
            await rm(directory, { recursive: true, force: true });
        }
    }, { auto: true }],
});
export { expect };
