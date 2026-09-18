import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FocusScreen } from "./FocusScreen";
import { FakeFocusApi, task } from "./testApi";

const region = (name: string) => screen.getByRole("region", { name });

test("keeps A and B interrupted after A → B → C and can resume A", async () => {
    const user = userEvent.setup();
    render(<FocusScreen api={new FakeFocusApi([task(1, "A 작업"), task(2, "B 요청"), task(3, "C 작업")])} />);
    for (const title of ["A 작업", "B 요청", "C 작업"]) {
        await user.click(await screen.findByRole("button", { name: `${title} 시작` }));
    }
    expect(region("지금 하는 일")).toHaveTextContent("C 작업");
    expect(region("하다 만 작업")).toHaveTextContent("A 작업");
    expect(region("하다 만 작업")).toHaveTextContent("B 요청");
    await user.click(screen.getByRole("button", { name: "A 작업 이어 하기" }));
    expect(region("지금 하는 일")).toHaveTextContent("A 작업");
});

test("empty current region offers a keyboard focus path to quick add", async () => {
    const user = userEvent.setup();
    render(<FocusScreen api={new FakeFocusApi()} />);
    expect(await screen.findByText("지금 하는 일 없음")).toBeVisible();
    await user.click(within(region("지금 하는 일")).getByRole("button", { name: "작업 추가하기" }));
    expect(screen.getByRole("textbox", { name: "새 작업" })).toHaveFocus();
    expect(region("답할 요청")).toHaveTextContent("Slack 연동 후 요청이 여기에 표시돼요.");
});

test("keyboard Enter adds a task without starting it", async () => {
    const user = userEvent.setup();
    render(<FocusScreen api={new FakeFocusApi()} />);
    await screen.findByText("지금 하는 일 없음");
    await user.type(screen.getByRole("textbox", { name: "새 작업" }), "  로그인 문의 확인  {Enter}");
    expect(await screen.findByRole("button", { name: "로그인 문의 확인 시작" })).toBeVisible();
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    expect(screen.getByRole("textbox", { name: "새 작업" })).toHaveValue("");
});

test("add and start becomes current and pause keeps the task available", async () => {
    const user = userEvent.setup();
    render(<FocusScreen api={new FakeFocusApi()} />);
    await screen.findByText("지금 하는 일 없음");
    await user.type(screen.getByRole("textbox", { name: "새 작업" }), "집계 오류 확인");
    await user.click(screen.getByRole("button", { name: "추가하고 시작" }));
    expect(region("지금 하는 일")).toHaveTextContent("집계 오류 확인");
    await user.click(screen.getByRole("button", { name: "잠시 멈추기" }));
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    expect(await screen.findByRole("button", { name: "집계 오류 확인 이어 하기" })).toBeVisible();
});

test("complete removes current work without automatically resuming interrupted work", async () => {
    const user = userEvent.setup();
    render(<FocusScreen api={new FakeFocusApi([task(1, "A"), task(2, "B")])} />);
    await user.click(await screen.findByRole("button", { name: "A 시작" }));
    await user.click(screen.getByRole("button", { name: "B 시작" }));
    await user.click(screen.getByRole("button", { name: "완료" }));
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    expect(region("하다 만 작업")).toHaveTextContent("A");
    expect(screen.queryByRole("button", { name: "B 시작" })).not.toBeInTheDocument();
});

test("server failure preserves typed title and never reports a successful add", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi();
    api.failCreate = true;
    render(<FocusScreen api={api} />);
    await screen.findByText("지금 하는 일 없음");
    await user.type(screen.getByRole("textbox", { name: "새 작업" }), "잊으면 안 되는 일");
    await user.click(screen.getByRole("button", { name: "추가하고 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 결과를 확인하지 못했어요");
    expect(screen.getByRole("textbox", { name: "새 작업" })).toHaveValue("잊으면 안 되는 일");
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
});

test("failed add-and-start keeps the created task and retry does not duplicate it", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi();
    api.failStart = true;
    render(<FocusScreen api={api} />);
    await screen.findByText("지금 하는 일 없음");
    await user.type(screen.getByRole("textbox", { name: "새 작업" }), "투표 확인");
    await user.click(screen.getByRole("button", { name: "추가하고 시작" }));
    expect(await screen.findByRole("button", { name: "투표 확인 시작" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "새 작업" })).toHaveValue("투표 확인");
    api.failStart = false;
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(region("지금 하는 일")).toHaveTextContent("투표 확인");
    expect(region("할 일")).not.toHaveTextContent("투표 확인");
    expect(screen.getByRole("textbox", { name: "새 작업" })).toHaveValue("");
});

test("retry reconciles a lost start response, and a later start is a new command", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi([task(1, "A")]);
    api.loseStartResponse = true;
    render(<FocusScreen api={api} />);
    await user.click(await screen.findByRole("button", { name: "A 시작" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    await api.pauseFocus("other-device-pause");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    await user.click(screen.getByRole("button", { name: "A 이어 하기" }));
    expect(region("지금 하는 일")).toHaveTextContent("A");
});

test("loading and initial connection failure allow refreshing", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi();
    api.failRead = true;
    render(<FocusScreen api={api} />);
    expect(screen.getByRole("status")).toHaveTextContent("불러오고");
    expect(await screen.findByRole("alert")).toHaveTextContent("연결하지 못했어요");
    api.failRead = false;
    await user.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByText("지금 하는 일 없음")).toBeVisible();
});

test("collapsing interrupted work retains count and a way to expand", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi([task(1, "남은 일", "interrupted")]);
    render(<FocusScreen api={api} />);
    await screen.findByRole("button", { name: "남은 일 이어 하기" });
    await user.click(screen.getByRole("button", { name: "하다 만 작업 1개 접기" }));
    expect(screen.queryByRole("button", { name: "남은 일 이어 하기" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "하다 만 작업 1개 펼치기" }));
    expect(screen.getByRole("button", { name: "남은 일 이어 하기" })).toBeVisible();
});

test("task details reveal the complete title and safe original link separately from start", async () => {
    const user = userEvent.setup();
    const title = "아주 긴 카미오시 투표 집계 오류에 관한 사용자 문의와 재현 조건을 확인하고 답변 초안 작성하기";
    render(<FocusScreen api={new FakeFocusApi([{ ...task(1, title), source_url: "https://example.com/thread", note: "어제 재현한 조건부터" }])} />);
    const details = await screen.findByRole("button", { name: `${title} 자세히 보기` });
    details.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("어제 재현한 조건부터")).toBeVisible();
    expect(screen.getByRole("link", { name: "원문 열기" })).toHaveAttribute("href", "https://example.com/thread");
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
});

test("read recovery after successful refresh never replays an earlier failed start", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi([task(1, "A")]);
    render(<FocusScreen api={api} />);
    api.failStart = true;
    await user.click(await screen.findByRole("button", { name: "A 시작" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    api.failStart = false;
    await user.click(screen.getByRole("button", { name: "새로고침" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    api.failRead = true;
    await user.click(screen.getByRole("button", { name: "새로고침" }));
    const recovery = within(await screen.findByRole("alert")).getByRole("button");
    api.failRead = false;
    await user.click(recovery);
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    expect(screen.getByRole("button", { name: "A 시작" })).toBeVisible();
});

test("read failure after successful start recovers authoritative state after another device pauses", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi([task(1, "A")]);
    render(<FocusScreen api={api} />);
    const start = await screen.findByRole("button", { name: "A 시작" });
    api.failRead = true;
    await user.click(start);
    expect(await screen.findByRole("alert")).toHaveTextContent("저장했지만 목록을 불러오지 못했어요");
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    await api.pauseFocus("other-device-pause");
    api.failRead = false;
    await user.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    expect(screen.getByRole("button", { name: "A 이어 하기" })).toBeVisible();
});

test("independent refresh preserves a known-created task for add-and-start recovery", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi();
    render(<FocusScreen api={api} />);
    await screen.findByText("지금 하는 일 없음");
    api.failStart = true;
    await user.type(screen.getByRole("textbox", { name: "새 작업" }), "투표 확인");
    await user.click(screen.getByRole("button", { name: "추가하고 시작" }));
    expect(await screen.findByRole("button", { name: "투표 확인 시작" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "새로고침" }));
    api.failStart = false;
    await user.click(screen.getByRole("button", { name: "추가하고 시작" }));
    expect(region("지금 하는 일")).toHaveTextContent("투표 확인");
    expect(region("할 일")).not.toHaveTextContent("투표 확인");
    expect(screen.getByRole("textbox", { name: "새 작업" })).toHaveValue("");
});

test("historical command replay stays invisible until a fresh authoritative read succeeds", async () => {
    const user = userEvent.setup();
    const api = new FakeFocusApi([task(1, "A")]);
    render(<FocusScreen api={api} />);
    const start = await screen.findByRole("button", { name: "A 시작" });
    api.loseStartResponse = true;
    api.failRead = true;
    await user.click(start);
    expect(await screen.findByRole("alert")).toBeVisible();
    await api.pauseFocus("other-device-pause");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    expect(screen.queryByRole("button", { name: "잠시 멈추기" })).not.toBeInTheDocument();
    api.failRead = false;
    await user.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(region("지금 하는 일")).toHaveTextContent("지금 하는 일 없음");
    expect(screen.getByRole("button", { name: "A 이어 하기" })).toBeVisible();
});
