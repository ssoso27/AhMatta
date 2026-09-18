import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { addAndStart, noPageOverflow, reachable, screenshot, tabTo } from "./helpers";

test("axe finds no WCAG A/AA violations in empty, active, interrupted and history views", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByText("지금 하는 일 없음")).toBeVisible();
    for (const state of ["empty", "active", "interrupted", "history"]) {
        if (state === "active") await addAndStart(page, "카미오시 투표 집계 오류 확인");
        if (state === "interrupted") await addAndStart(page, "셀럽 배너 노출 조건 수정");
        if (state === "history") {
            await page.getByRole("button", { name: "기록", exact: true }).click();
            await expect(page.getByRole("list", { name: "작업별 기록" })).toBeVisible();
        }
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        await testInfo.attach(`axe-${state}`, { body: JSON.stringify(results, null, 2), contentType: "application/json" });
        expect(results.violations, `${state}: ${JSON.stringify(results.violations)}`).toEqual([]);
    }
});

test("keyboard adds, starts, resumes and completes with visible focus", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("지금 하는 일 없음")).toBeVisible();
    const input = page.getByRole("textbox", { name: "새 작업" });
    await tabTo(page, input);
    await page.keyboard.type("A 키보드 작업");
    await tabTo(page, page.getByRole("button", { name: "추가", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "할 일", exact: true })).toContainText("A 키보드 작업");
    await tabTo(page, page.getByRole("button", { name: "A 키보드 작업 시작" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "지금 하는 일" })).toContainText("A 키보드 작업");
    await tabTo(page, input);
    await page.keyboard.type("B 키보드 작업");
    await tabTo(page, page.getByRole("button", { name: "추가하고 시작" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "지금 하는 일" })).toContainText("B 키보드 작업");
    await tabTo(page, page.getByRole("button", { name: "A 키보드 작업 이어 하기" }));
    await screenshot(page, "keyboard-focus");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "지금 하는 일" })).toContainText("A 키보드 작업");
    await tabTo(page, page.getByRole("button", { name: "완료", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page.getByText("지금 하는 일 없음")).toBeVisible();
    await expect(page.getByRole("region", { name: "하다 만 작업" })).toContainText("B 키보드 작업");
});

test("increased text spacing preserves expanded titles and primary actions at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto("/");
    const title = "긴 한글 작업 제목의 줄 간격과 글자 간격을 늘려도 작업 내용을 확인하기";
    await addAndStart(page, title);
    await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }" });
    await page.getByRole("button", { name: `${title} 자세히 보기` }).click();
    const expanded = page.getByRole("button", { name: `${title} 자세히 닫기` });
    expect(await expanded.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    await reachable(page.getByRole("button", { name: "완료", exact: true }));
    await noPageOverflow(page);
    await screenshot(page, "text-spacing-360");
});
