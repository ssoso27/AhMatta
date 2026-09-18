import { useState } from "react";
import { FocusScreen } from "./features/focus/FocusScreen";
import { HistoryScreen } from "./features/history/HistoryScreen";

export function App() {
    const [page, setPage] = useState("지금");
    return <div className={`app-shell${page === "기록" ? " history-shell" : ""}`}>
        <div className="page-content" hidden={page !== "지금"}><FocusScreen /></div>
        {page === "기록" && <HistoryScreen />}
        {page === "설정" && <div className="page-content"><header className="app-header"><h1>아맞다<span>설정</span></h1></header>
            <main><p>설정 화면은 다음 단계에서 제공됩니다.</p></main></div>}
        <nav className="bottom-nav" aria-label="주 메뉴">{["지금", "기록", "설정"].map(name =>
            <button key={name} aria-current={page === name ? "page" : undefined} onClick={() => setPage(name)}>{name}</button>)}
        </nav>
    </div>;
}
