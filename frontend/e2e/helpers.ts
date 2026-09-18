import { expect, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function addAndStart(page: Page, title: string) {
    await page.getByRole("textbox", { name: "새 작업" }).fill(title);
    await page.getByRole("button", { name: "추가하고 시작", exact: true }).click();
    await expect(page.getByRole("region", { name: "지금 하는 일" })).toContainText(title);
    await expect(page.getByRole("button", { name: "잠시 멈추기" })).toBeEnabled();
}
export async function noPageOverflow(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
export async function reachable(locator: Locator) {
    await locator.scrollIntoViewIfNeeded();
    await expect(locator).toBeInViewport();
    await expect(locator).toBeEnabled();
    await locator.click({ trial: true });
}
export async function screenshot(page: Page, name: string, fullPage = true) {
    const directory = fileURLToPath(new URL("../../output/playwright/", import.meta.url));
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: `${directory}${name}.png`, fullPage });
}
export async function tabTo(page: Page, target: Locator) {
    for (let count = 0; count < 40; count++) {
        await page.keyboard.press("Tab");
        if (await target.evaluate(element => element === document.activeElement)) {
            await expect(target).toBeInViewport();
            expect(await target.evaluate(element => {
                const style = getComputedStyle(element);
                return element.matches(":focus-visible") && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
            })).toBe(true);
            return;
        }
    }
    throw new Error(`Keyboard could not reach ${await target.getAttribute("aria-label")}`);
}
