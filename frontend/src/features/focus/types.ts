export type TaskStatus = "todo" | "active" | "interrupted" | "waiting" | "done" | "cancelled";
export interface Task {
    id: number;
    title: string;
    status: TaskStatus;
    requester: string | null;
    source_url: string | null;
    note: string;
    color_key: string | null;
    created_at: string;
    updated_at: string;
    version: number;
}
export interface ActiveTask extends Task { elapsed_seconds: number }
export interface FocusSnapshot {
    active_task: ActiveTask | null;
    interrupted: Task[];
    todo: Task[];
}
export interface FocusApi {
    getFocus(): Promise<FocusSnapshot>;
    createTask(input: { title: string }): Promise<Task>;
    startTask(id: number, requestId: string): Promise<FocusSnapshot>;
    pauseFocus(requestId: string): Promise<FocusSnapshot>;
    completeTask(id: number, requestId: string): Promise<FocusSnapshot>;
}
