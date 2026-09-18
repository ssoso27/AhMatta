import { useRef } from "react";
import { focusApi } from "./api";
import type { FocusApi } from "./types";
import { useFocus } from "./useFocus";
import { QuickAdd } from "./QuickAdd";
import { CurrentTask } from "./CurrentTask";
import { TaskList } from "./TaskList";
import "../../styles/tokens.css";
import "../../styles/global.css";

export function FocusScreen({ api = focusApi }: { api?: FocusApi }) {
    const focus = useFocus(api);
    const input = useRef<HTMLInputElement>(null);
    const disabled = focus.busy || focus.loading;
    return <div className="app-shell">
        <header className="app-header"><h1>아맞다<span>지금</span></h1>
            <button className="text-button" disabled={disabled} onClick={focus.refresh}>새로고침</button></header>
        <main>
            <QuickAdd title={focus.title} onTitle={focus.setTitle} onAdd={focus.add} disabled={disabled} inputRef={input} />
            {(focus.loading || focus.busy) && <p role="status" className="status-text">{focus.loading ? "작업을 불러오고 있어요." : "저장하고 있어요."}</p>}
            {focus.error && <div className="error-message" role="alert"><p>{focus.error}</p>
                <button onClick={focus.retry ?? focus.refresh} disabled={disabled}>{focus.retry ? "다시 시도" : "다시 불러오기"}</button></div>}
            {focus.snapshot && <>
                <CurrentTask task={focus.snapshot.active_task} disabled={disabled} onPause={focus.pause}
                    onComplete={focus.complete} onAdd={() => input.current?.focus()} />
                <TaskList title="하다 만 작업" tasks={focus.snapshot.interrupted} resume disabled={disabled} onStart={focus.start} />
                <section aria-labelledby="requests-heading" className="task-section">
                    <div className="section-heading"><h2 id="requests-heading">답할 요청</h2><span className="secondary">연동 전</span></div>
                    <p className="empty-text">Slack 연동 후 요청이 여기에 표시돼요.</p>
                </section>
                <TaskList title="할 일" tasks={focus.snapshot.todo} disabled={disabled} onStart={focus.start} />
            </>}
        </main>
        <nav className="bottom-nav" aria-label="주 메뉴">
            <a href="#" aria-current="page">지금</a><button disabled title="기록 화면 준비 중">기록</button><button disabled title="설정 화면 준비 중">설정</button>
        </nav>
    </div>;
}
