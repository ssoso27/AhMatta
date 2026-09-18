import { render, screen } from "@testing-library/react";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());
test("loads the working screen through the real app and API client", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ active_task: null, interrupted: [], todo: [] }));
    render(<App />);
    expect(await screen.findByRole("region", { name: "지금 하는 일" })).toHaveTextContent("지금 하는 일 없음");
    expect(screen.getByRole("textbox", { name: "새 작업" })).toBeVisible();
});
