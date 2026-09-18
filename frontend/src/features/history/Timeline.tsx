import type { DailyHistory } from "./types";

export function Timeline({ history }: { history: DailyHistory }) {
    const minutes = history.day_seconds / 60;
    const clock = new Intl.DateTimeFormat("ko-KR", { timeZone: history.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const ticks = Array.from({ length: Math.ceil(minutes / 120) }, (_, index) => index * 120);
    return <section aria-label="작업 시간표" className="timeline">
        <div className="timeline-names" aria-hidden="true"><div className="timeline-axis">작업</div>
            {history.rows.map(row => <div key={row.task_id} className="timeline-name" title={row.title}><span>{row.title}</span></div>)}
        </div>
        <div className="timeline-scroll" tabIndex={0} aria-label="시간축 가로 스크롤">
            <div className="timeline-tracks">
                <div className="timeline-axis">{ticks.map(minute => <span key={minute} style={{ left: `${minute / minutes * 100}%` }}>
                    {clock.format(new Date(Date.parse(history.day_start) + minute * 60000))}
                </span>)}</div>
                {history.rows.map(row => <div key={row.task_id} className="timeline-track">
                    {row.segments.map(segment => <span key={segment.session_id} className="timeline-bar" role="img"
                        aria-label={`${row.title}: ${segment.local_start.slice(11)}–${segment.local_end.slice(11)} (${segment.started_at}–${segment.ended_at})`}
                        title={`${row.title} · ${segment.local_start.slice(11)}–${segment.local_end.slice(11)}`}
                        style={{ left: `${segment.start_minute / minutes * 100}%`, width: `${(segment.end_minute - segment.start_minute) / minutes * 100}%` }} />)}
                </div>)}
            </div>
        </div>
    </section>;
}
