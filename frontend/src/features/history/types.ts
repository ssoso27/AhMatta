import type { TaskStatus } from "../focus/types";

export interface HistorySegment {
    session_id: number;
    started_at: string;
    ended_at: string;
    local_start: string;
    local_end: string;
    start_minute: number;
    end_minute: number;
}
export interface HistoryRow {
    task_id: number;
    title: string;
    status: TaskStatus;
    color_key: string | null;
    total_seconds: number;
    segments: HistorySegment[];
}
export interface DailyHistory {
    date: string;
    timezone: string;
    day_start: string;
    day_seconds: number;
    total_seconds: number;
    rows: HistoryRow[];
}
export interface HistoryApi {
    forDay(date: string, timezone: string): Promise<DailyHistory>;
}
