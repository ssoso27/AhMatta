import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryScreen } from "./HistoryScreen";

const history = {
    date: "2026-09-17", timezone: "Asia/Seoul", day_start: "2026-09-16T15:00:00Z",
    day_seconds: 86400, total_seconds: 5465,
    rows: [
        { task_id: 1, title: "집계 오류 확인", status: "done", color_key: null, total_seconds: 5400,
            segments: [
                { session_id: 1, started_at: "2026-09-17T00:00:00Z", ended_at: "2026-09-17T01:00:00Z", local_start: "2026-09-17T09:00:00", local_end: "2026-09-17T10:00:00", start_minute: 540, end_minute: 600 },
                { session_id: 2, started_at: "2026-09-17T02:00:00Z", ended_at: "2026-09-17T02:30:00Z", local_start: "2026-09-17T11:00:00", local_end: "2026-09-17T11:30:00", start_minute: 660, end_minute: 690 },
            ] },
        { task_id: 2, title: "로그인 문의", status: "interrupted", color_key: null, total_seconds: 65,
            segments: [{ session_id: 3, started_at: "2026-09-17T03:00:00Z", ended_at: "2026-09-17T03:01:05Z", local_start: "2026-09-17T12:00:00", local_end: "2026-09-17T12:01:05", start_minute: 720, end_minute: 721.0833333333334 }] },
    ],
};
const now = () => new Date("2026-09-18T03:00:00Z");
const report = "- 집계 오류 확인 (1시간 30분) · 완료\n- 로그인 문의 (1분 5초) · 중단";

beforeEach(() => {
    vi.stubGlobal("fetch", async (input: string) => {
        const url = new URL(input, "http://test");
        if (url.pathname !== "/api/history" || url.searchParams.get("timezone") !== "Asia/Seoul") return new Response(null, { status: 400 });
        const day = url.searchParams.get("date");
        return Response.json(day === "2026-09-17" ? history : { ...history, date: day, rows: [], total_seconds: 0 });
    });
});
afterEach(() => vi.unstubAllGlobals());

test("selects a local date and shows plain totals plus separate resumed intervals", async () => {
    render(<HistoryScreen now={now} />);
    expect(screen.getByLabelText("날짜")).toHaveValue("2026-09-18");
    expect(await screen.findByText("이날 기록한 작업이 없어요.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("날짜"), { target: { value: "2026-09-17" } });
    const list = await screen.findByRole("list", { name: "작업별 기록" });
    expect(list).toHaveTextContent("집계 오류 확인");
    expect(list).toHaveTextContent("1시간 30분");
    expect(list).toHaveTextContent("로그인 문의");
    expect(list).toHaveTextContent("1분 5초");
    expect(screen.getByText("총 1시간 31분 5초")).toBeVisible();
    const timeline = screen.getByRole("region", { name: "작업 시간표" });
    expect(within(timeline).getAllByRole("img", { name: /집계 오류 확인/ })).toHaveLength(2);
    expect(within(timeline).getByRole("img", { name: /09:00.*10:00/ })).toHaveStyle({ left: "37.5%", width: "4.166666666666666%" });
});

test("copies actual yesterday rows even while today is selected", async () => {
    const user = userEvent.setup();
    render(<HistoryScreen now={now} />);
    await screen.findByText("이날 기록한 작업이 없어요.");
    await user.click(screen.getByRole("button", { name: "어제 한 일 복사" }));
    expect(await screen.findByText("복사했어요.")).toBeVisible();
    expect(await navigator.clipboard.readText()).toBe(report);
    expect(screen.getByRole("textbox", { name: "복사할 기록" })).toHaveValue(report);
});

test("clipboard failure keeps the generated report available to copy manually", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
    render(<HistoryScreen now={now} />);
    await screen.findByText("이날 기록한 작업이 없어요.");
    await user.click(screen.getByRole("button", { name: "어제 한 일 복사" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("복사하지 못했습니다. 다시 시도해 주세요.");
    expect(screen.getByRole("textbox", { name: "복사할 기록" })).toHaveValue(report);
});

test("failed loading offers a retry without presenting the previous date as current", async () => {
    const user = userEvent.setup();
    render(<HistoryScreen now={now} />);
    await screen.findByText("이날 기록한 작업이 없어요.");
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
    fireEvent.change(screen.getByLabelText("날짜"), { target: { value: "2026-09-17" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("기록을 불러오지 못했습니다.");
    expect(screen.queryByText("이날 기록한 작업이 없어요.")).not.toBeInTheDocument();
    vi.stubGlobal("fetch", async () => Response.json(history));
    await user.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByRole("list", { name: "작업별 기록" })).toHaveTextContent("집계 오류 확인");
});

test("an empty yesterday report leaves existing clipboard text intact", async () => {
    const user = userEvent.setup();
    await navigator.clipboard.writeText("기존 메모");
    vi.stubGlobal("fetch", async () => Response.json({ ...history, total_seconds: 0, rows: [] }));
    render(<HistoryScreen now={now} />);
    await screen.findByText("이날 기록한 작업이 없어요.");
    await user.click(screen.getByRole("button", { name: "어제 한 일 복사" }));
    expect(await screen.findByText("어제 기록한 작업이 없어요.")).toBeVisible();
    expect(await navigator.clipboard.readText()).toBe("기존 메모");
    expect(screen.queryByRole("textbox", { name: "복사할 기록" })).not.toBeInTheDocument();
});

test("copy reports active work and keeps multiline task titles on one line", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", async () => Response.json({ ...history, total_seconds: 5400,
        rows: [{ ...history.rows[0], title: "첫째 줄\n둘째 줄", status: "active" }] }));
    render(<HistoryScreen now={now} />);
    await screen.findByRole("list", { name: "작업별 기록" });
    await user.click(screen.getByRole("button", { name: "어제 한 일 복사" }));
    await screen.findByText("복사했어요.");
    expect(await navigator.clipboard.readText()).toBe("- 첫째 줄 둘째 줄 (1시간 30분) · 진행 중");
});

test("task titles can be expanded and collapsed with the keyboard", async () => {
    const user = userEvent.setup();
    render(<HistoryScreen now={now} />);
    await screen.findByText("이날 기록한 작업이 없어요.");
    fireEvent.change(screen.getByLabelText("날짜"), { target: { value: "2026-09-17" } });
    const title = await screen.findByRole("button", { name: "집계 오류 확인 전체 제목 보기" });
    expect(title).toHaveAttribute("aria-expanded", "false");
    title.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "집계 오류 확인 제목 접기" })).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Enter}");
    expect(title).toHaveAttribute("aria-expanded", "false");
});
