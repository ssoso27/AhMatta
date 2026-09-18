import { useEffect, useState } from "react";
import { historyApi } from "./api";
import { Timeline } from "./Timeline";
import type { DailyHistory, HistoryApi, HistoryRow } from "./types";

const currentTime = () => new Date();
function localDate(now: Date, timezone: string): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function previousDate(day: string): string {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
}
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const rest = Math.floor(seconds % 60);
    return [hours && `${hours}시간`, minutes && `${minutes}분`, rest && `${rest}초`].filter(Boolean).join(" ") || "0초";
}
function statusLabel(row: HistoryRow): string {
    return row.status === "done" ? "완료" : row.status === "active" ? "진행 중" : "중단";
}

function HistoryTask({ row }: { row: HistoryRow }) {
    const [expanded, setExpanded] = useState(false);
    return <li>
        <h2><button className={`task-title ${expanded ? "expanded" : ""}`} aria-expanded={expanded}
            aria-label={`${row.title} ${expanded ? "제목 접기" : "전체 제목 보기"}`}
            onClick={() => setExpanded(!expanded)}>{row.title}</button></h2>
        <p>{formatDuration(row.total_seconds)} · {statusLabel(row)}</p>
        <p className="secondary">{row.segments.map(segment => `${segment.local_start.slice(11, 16)}–${segment.local_end.slice(11, 16)}`).join(" / ")}</p>
    </li>;
}

export function HistoryScreen({ api = historyApi, now = currentTime, timezone = "Asia/Seoul" }: {
    api?: HistoryApi; now?: () => Date; timezone?: string;
}) {
    const [date, setDate] = useState(() => localDate(now(), timezone));
    const [history, setHistory] = useState<DailyHistory | null>(null);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const [report, setReport] = useState("");
    const [copyStatus, setCopyStatus] = useState("");
    const [copyError, setCopyError] = useState("");
    const [copying, setCopying] = useState(false);
    useEffect(() => {
        let current = true;
        setHistory(null);
        setError("");
        if (!date) return;
        api.forDay(date, timezone).then(result => { if (current) setHistory(result); })
            .catch(() => { if (current) setError("기록을 불러오지 못했습니다."); });
        return () => { current = false; };
    }, [api, date, timezone, revision]);
    async function copyYesterday() {
        setCopying(true);
        setCopyStatus("");
        setCopyError("");
        try {
            const yesterday = await api.forDay(previousDate(localDate(now(), timezone)), timezone);
            const text = yesterday.rows.map(row => `- ${row.title.replace(/\s+/g, " ").trim()} (${formatDuration(row.total_seconds)}) · ${statusLabel(row)}`).join("\n");
            setReport(text);
            if (!text) { setCopyStatus("어제 기록한 작업이 없어요."); return; }
            try {
                await navigator.clipboard.writeText(text);
                setCopyStatus("복사했어요.");
            } catch { setCopyError("복사하지 못했습니다. 다시 시도해 주세요."); }
        } catch { setCopyError("어제 기록을 불러오지 못했습니다. 다시 시도해 주세요."); }
        finally { setCopying(false); }
    }
    return <div className="history-screen">
        <header className="app-header"><h1>아맞다<span>기록</span></h1></header>
        <main>
            <div className="history-controls"><label htmlFor="history-date">날짜</label>
                <input id="history-date" type="date" value={date} onChange={event => setDate(event.target.value)} />
                <span className="secondary">{timezone}</span>
            </div>
            {error && <div role="alert" className="error-message"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>다시 불러오기</button></div>}
            {!history && !error && date && <p role="status">기록을 불러오고 있어요.</p>}
            {history && <>
                <p className="history-total">총 {formatDuration(history.total_seconds)}</p>
                {history.rows.length === 0 ? <p className="empty-text">이날 기록한 작업이 없어요.</p> : <div className="history-content">
                    <ul className="history-list" aria-label="작업별 기록">{history.rows.map(row => <HistoryTask key={row.task_id} row={row} />)}</ul>
                    <Timeline history={history} />
                </div>}
            </>}
            <section aria-label="어제 기록 복사" className="history-copy">
                <button onClick={copyYesterday} disabled={copying}>{copying ? "기록을 준비하고 있어요." : "어제 한 일 복사"}</button>
                {copyStatus && <p role="status">{copyStatus}</p>}
                {copyError && <p role="alert">{copyError}</p>}
                {report && <><label htmlFor="history-report">복사할 기록</label><textarea id="history-report" readOnly value={report} rows={5} /></>}
            </section>
        </main>
    </div>;
}
