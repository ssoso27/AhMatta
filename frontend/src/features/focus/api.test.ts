import { createFocusApi } from "./api";

const empty = { active_task: null, interrupted: [], todo: [] };
afterEach(() => vi.unstubAllGlobals());

test("production API reads the focus endpoint", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
        if (url !== "/api/focus") return new Response("", { status: 404 });
        return Response.json(empty);
    });
    expect(await createFocusApi().getFocus()).toEqual(empty);
});

test("production commands send the request ID and exact route for each mutation", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        const valid = new Map([["/api/tasks/7/start", "start-1"], ["/api/focus/pause", "pause-1"], ["/api/tasks/7/complete", "complete-1"]]);
        const body = JSON.parse(init.body as string);
        if (init.method !== "POST" || body.request_id !== valid.get(url)) return new Response("", { status: 409 });
        return Response.json(empty);
    });
    const api = createFocusApi();
    expect(await api.startTask(7, "start-1")).toEqual(empty);
    expect(await api.pauseFocus("pause-1")).toEqual(empty);
    expect(await api.completeTask(7, "complete-1")).toEqual(empty);
});

test("rejected HTTP mutations fail instead of parsing as successful focus state", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ detail: "conflict" }, { status: 409 }));
    await expect(createFocusApi().startTask(7, "request")).rejects.toThrow();
});

test("create posts a title and returns the created task", async () => {
    const { task } = await import("./testApi");
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        if (url !== "/api/tasks" || init.method !== "POST" || JSON.parse(init.body as string).title !== "새 일") return new Response("", { status: 422 });
        return Response.json(task(7, "새 일"), { status: 201 });
    });
    expect(await createFocusApi().createTask({ title: "새 일" })).toMatchObject({ id: 7, title: "새 일", status: "todo" });
});
