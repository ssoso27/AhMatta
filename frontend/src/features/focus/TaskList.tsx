import { useId, useState } from "react";
import type { Task } from "./types";

export function TaskDetails({ task }: { task: Task }) {
    const [expanded, setExpanded] = useState(false);
    const id = useId();
    const safeUrl = task.source_url && /^https?:\/\//i.test(task.source_url) ? task.source_url : null;
    return <div className="task-copy">
        <button className={`task-title ${expanded ? "expanded" : ""}`} aria-expanded={expanded}
            aria-controls={id} aria-label={`${task.title} 자세히 ${expanded ? "닫기" : "보기"}`}
            onClick={() => setExpanded(!expanded)}>{task.title}</button>
        {task.requester && <p className="secondary requester">{task.requester}</p>}
        <div id={id} hidden={!expanded} className="task-detail">
            {task.note && <p>{task.note}</p>}
            <p className="secondary">최근 변경 {new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(task.updated_at))}</p>
            {safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer">원문 열기</a>}
        </div>
    </div>;
}

interface Props {
    title: string;
    tasks: Task[];
    resume?: boolean;
    disabled: boolean;
    onStart: (id: number) => void;
}
export function TaskList({ title, tasks, resume = false, disabled, onStart }: Props) {
    const [collapsed, setCollapsed] = useState(false);
    const id = useId();
    const listId = useId();
    const action = resume ? "이어 하기" : "시작";
    return <section aria-labelledby={id} className="task-section">
        <div className="section-heading">
            <h2><span id={id}>{title}</span> <span className="count">{tasks.length}</span></h2>
            {tasks.length > 0 && <button className="text-button" aria-expanded={!collapsed} aria-controls={listId}
                aria-label={`${title} ${tasks.length}개 ${collapsed ? "펼치기" : "접기"}`}
                onClick={() => setCollapsed(!collapsed)}>{collapsed ? "펼치기" : "접기"}</button>}
        </div>
        <div id={listId} hidden={collapsed}>
            {tasks.length === 0 ? <p className="empty-text">{resume ? "하다 만 작업이 없어요." : "아직 시작하지 않은 일이 없어요."}</p> :
                <ul className="task-list">{tasks.map(task => <li key={task.id}>
                    <TaskDetails task={task} />
                    <button className="start-button" disabled={disabled} aria-label={`${task.title} ${action}`}
                        onClick={() => onStart(task.id)}>{action}</button>
                </li>)}</ul>}
        </div>
    </section>;
}
