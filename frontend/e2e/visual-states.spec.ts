import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./fixtures";
import { addAndStart, noPageOverflow, reachable, screenshot } from "./helpers";

const longTitle = "카미오시 투표 집계 오류와 긴 한글 작업 제목을 확인하고 결과를 정리하는 작업";
for (const width of [400, 360]) {
    test(`${width}×760 keeps current, interrupted and history actions reachable`, async ({ page }) => {
        await page.setViewportSize({ width, height: 760 });
        await page.goto("/");
        await expect(page.getByText("지금 하는 일 없음")).toBeVisible();
        await noPageOverflow(page);
        await screenshot(page, `empty-${width}`);
        await addAndStart(page, longTitle);
        await reachable(page.getByRole("button", { name: "잠시 멈추기" }));
        await reachable(page.getByRole("button", { name: "완료", exact: true }));
        await noPageOverflow(page);
        await screenshot(page, `current-${width}`);
        await addAndStart(page, "셀럽 배너 노출 조건 수정");
        await addAndStart(page, "최애돌 로그인 문의 확인");
        await reachable(page.getByRole("button", { name: `${longTitle} 이어 하기` }));
        await noPageOverflow(page);
        await screenshot(page, `interrupted-${width}`);
        await page.getByRole("button", { name: "기록", exact: true }).click();
        await expect(page.getByRole("list", { name: "작업별 기록" })).toContainText(longTitle);
        await noPageOverflow(page);
        expect(await page.locator(".timeline-track").first().evaluate(element => parseFloat(getComputedStyle(element).backgroundSize))).toBeCloseTo(8.33333);
        const axis = page.getByLabel("시간축 가로 스크롤");
        expect(await axis.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        await axis.focus();
        await page.keyboard.press("ArrowRight");
        await expect.poll(() => axis.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        await reachable(page.getByRole("button", { name: "어제 한 일 복사" }));
        await page.getByRole("img").last().scrollIntoViewIfNeeded();
        await screenshot(page, `history-${width}`);
    });
}

test("200% native browser zoom reflows and keeps task actions reachable", async () => {
    const profile = await mkdtemp(join(tmpdir(), "ahmatta-zoom-"));
    const extension = fileURLToPath(new URL("./zoom-extension", import.meta.url));
    const context = await chromium.launchPersistentContext(profile, {
        channel: "chromium", headless: true, viewport: { width: 400, height: 760 },
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
        const page = await context.newPage();
        await page.goto("http://127.0.0.1:18743");
        await addAndStart(page, longTitle);
        const baseline = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
        const zoom = await worker.evaluate(async () => {
            const chrome = (globalThis as unknown as { chrome: { tabs: {
                query: (query: object) => Promise<{ id: number; url: string }[]>;
                setZoom: (id: number, zoom: number) => Promise<void>;
                getZoom: (id: number) => Promise<number>;
            } } }).chrome;
            const tab = (await chrome.tabs.query({})).find(tab => tab.url.startsWith("http://127.0.0.1:18743"))!;
            await chrome.tabs.setZoom(tab.id, 2);
            return chrome.tabs.getZoom(tab.id);
        });
        expect(zoom).toBe(2);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(baseline.width / 2);
        expect(await page.evaluate(() => devicePixelRatio)).toBe(baseline.dpr * 2);
        const title = page.getByRole("button", { name: `${longTitle} 자세히 보기` });
        await reachable(title);
        await title.click();
        await expect(page.getByRole("button", { name: `${longTitle} 자세히 닫기` })).toHaveAttribute("aria-expanded", "true");
        await reachable(page.getByRole("button", { name: "잠시 멈추기" }));
        await reachable(page.getByRole("button", { name: "완료", exact: true }));
        await noPageOverflow(page);
        await screenshot(page, "current-zoom-200", false);
        await page.getByRole("button", { name: "완료", exact: true }).click();
        await expect(page.getByText("지금 하는 일 없음")).toBeVisible();
    } finally {
        await context.close();
        await rm(profile, { recursive: true, force: true });
    }
});
