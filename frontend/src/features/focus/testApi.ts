import type { ActiveTask, FocusApi, FocusSnapshot, Task, TaskStatus } from "./types";

export function task(id: number, title: string, status: TaskStatus = "todo"): Task {
    return { id, title, status, requester: null, source_url: null, note: "", color_key: null,
        created_at: "2026-09-17T08:00:00Z", updated_at: "2026-09-18T08:00:00Z", version: 1 };
}

export class FakeFocusApi implements FocusApi {
    failCreate = false;
    failRead = false;
    failStart = false;
    loseStartResponse = false;
    private tasks: Task[];
    private commands = new Map<string, string>();
    constructor(tasks: Task[] = []) { this.tasks = structuredClone(tasks); }
    async getFocus(): Promise<FocusSnapshot> {
        if (this.failRead) throw new Error("offline");
        const active = this.tasks.find(t => t.status === "active");
        return structuredClone({ active_task: active ? { ...active, elapsed_seconds: 1380 } as ActiveTask : null,
            interrupted: this.tasks.filter(t => t.status === "interrupted"), todo: this.tasks.filter(t => t.status === "todo") });
    }
    async createTask(input: { title: string }): Promise<Task> {
        if (this.failCreate) throw new Error("offline");
        const created = task(Math.max(0, ...this.tasks.map(t => t.id)) + 1, input.title.trim());
        this.tasks.push(created);
        return structuredClone(created);
    }
    private repeated(id: string, command: string) {
        if (!id) throw new Error("missing request ID");
        const previous = this.commands.get(id);
        if (previous && previous !== command) throw new Error("request ID conflict");
        if (previous) return true;
        this.commands.set(id, command);
        return false;
    }
    async startTask(id: number, requestId: string) {
        if (this.failStart) throw new Error("offline");
        if (!this.repeated(requestId, `start:${id}`)) {
            this.tasks = this.tasks.map(t => t.id === id ? { ...t, status: "active" } : t.status === "active" ? { ...t, status: "interrupted" } : t);
        }
        if (this.loseStartResponse) { this.loseStartResponse = false; throw new Error("lost response"); }
        return this.getFocus();
    }
    async pauseFocus(requestId: string) {
        if (!this.repeated(requestId, "pause")) this.tasks = this.tasks.map(t => t.status === "active" ? { ...t, status: "interrupted" } : t);
        return this.getFocus();
    }
    async completeTask(id: number, requestId: string) {
        if (!this.repeated(requestId, `complete:${id}`)) this.tasks = this.tasks.map(t => t.id === id ? { ...t, status: "done" } : t);
        return this.getFocus();
    }
}
