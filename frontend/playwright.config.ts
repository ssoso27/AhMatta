import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 30_000,
    expect: { timeout: 5_000 },
    outputDir: "../output/playwright/results",
    reporter: [["list"], ["html", { outputFolder: "../output/playwright/report", open: "never" }]],
    use: {
        baseURL: "http://127.0.0.1:18743",
        browserName: "chromium",
        viewport: { width: 400, height: 760 },
        timezoneId: "Asia/Seoul",
        locale: "ko-KR",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "npx vite --config e2e/vite.config.ts",
        url: "http://127.0.0.1:18743",
        reuseExistingServer: false,
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
});
