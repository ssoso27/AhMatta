import { render, screen } from "@testing-library/react";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());
test("loads the working screen through the real app and API client", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ active_task: null, interrupted: [], todo: [] }));
    render(<App />);
    expect(await screen.findByRole("region", { name: "지금 하는 일" })).toHaveTextContent("지금 하는 일 없음");
    expect(screen.getByRole("textbox", { name: "새 작업" })).toBeVisible();
});

test("bottom navigation opens history and the settings placeholder and returns to focus", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    vi.stubGlobal("fetch", async (input: string) => input.startsWith("/api/history")
        ? Response.json({ date: "2026-09-18", timezone: "Asia/Seoul", day_start: "2026-09-17T15:00:00Z", day_seconds: 86400, total_seconds: 0, rows: [] })
        : Response.json({ active_task: null, interrupted: [], todo: [] }));
    render(<App />);
    await screen.findByRole("region", { name: "지금 하는 일" });
    await user.type(screen.getByRole("textbox", { name: "새 작업" }), "입력 중인 작업");
    await user.click(screen.getByRole("button", { name: "기록" }));
    expect(await screen.findByText("이날 기록한 작업이 없어요.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByText("설정 화면은 다음 단계에서 제공됩니다.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "지금" }));
    expect(screen.getByRole("textbox", { name: "새 작업" })).toHaveValue("입력 중인 작업");
});
