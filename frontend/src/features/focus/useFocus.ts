import { useEffect, useRef, useState } from "react";
import type { FocusApi, FocusSnapshot, Task } from "./types";

type Operation = {
    execute: () => Promise<unknown>;
    retryable: boolean;
    saved: boolean;
    onSuccess?: () => void;
};

export function useFocus(api: FocusApi) {
    const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [title, setTitle] = useState("");
    const [retryOperation, setRetryOperation] = useState<Operation | null>(null);
    const locked = useRef(false);
    const awaitingRead = useRef(new Set<Operation>());
    const pendingAdd = useRef<{ title: string; created?: Task; requestId: string } | null>(null);

    function reconcile(value: FocusSnapshot) {
        setSnapshot(value);
        for (const operation of awaitingRead.current) operation.onSuccess?.();
        awaitingRead.current.clear();
    }

    useEffect(() => {
        let active = true;
        api.getFocus().then(value => {
            if (active) { setSnapshot(value); setLoading(false); }
        }).catch(() => {
            if (active) { setError("서버에 연결하지 못했어요."); setLoading(false); }
        });
        return () => { active = false; };
    }, [api]);

    async function refresh() {
        if (locked.current) return;
        locked.current = true;
        setLoading(true);
        setError("");
        setRetryOperation(null);
        try { reconcile(await api.getFocus()); }
        catch { setError("서버에 연결하지 못했어요. 마지막 목록을 표시해요."); }
        finally { setLoading(false); locked.current = false; }
    }

    async function run(operation: Operation) {
        if (locked.current) return;
        locked.current = true;
        setBusy(true);
        setError("");
        setRetryOperation(null);
        try {
            if (!operation.saved) {
                await operation.execute();
                operation.saved = true;
                awaitingRead.current.add(operation);
            }
            reconcile(await api.getFocus());
        } catch {
            setError(operation.saved ? "저장했지만 목록을 불러오지 못했어요." : "저장 결과를 확인하지 못했어요. 목록을 확인해 주세요.");
            if (operation.retryable && !operation.saved) setRetryOperation(operation);
            try {
                reconcile(await api.getFocus());
                if (operation.saved) setError("");
            } catch { /* 마지막으로 읽은 목록을 유지한다. */ }
        } finally {
            locked.current = false;
            setBusy(false);
        }
    }

    function command(execute: (requestId: string) => Promise<unknown>) {
        const requestId = crypto.randomUUID();
        return run({ execute: () => execute(requestId), retryable: true, saved: false });
    }

    function add(start: boolean) {
        const submittedTitle = title;
        const normalized = submittedTitle.trim();
        if (!normalized) return;
        if (pendingAdd.current?.title !== normalized) {
            pendingAdd.current = { title: normalized, requestId: crypto.randomUUID() };
        }
        const submission = pendingAdd.current;
        const operation: Operation = {
            retryable: false,
            saved: false,
            execute: async () => {
                if (!submission.created) submission.created = await api.createTask({ title: normalized });
                operation.retryable = true;
                if (start) await api.startTask(submission.created.id, submission.requestId);
            },
            onSuccess: () => {
                setTitle(current => current === submittedTitle ? "" : current);
                if (pendingAdd.current === submission) pendingAdd.current = null;
            },
        };
        return run(operation);
    }

    return { snapshot, loading, busy, error, title, setTitle, add, refresh,
        retry: retryOperation ? () => run(retryOperation) : undefined,
        start: (id: number) => command(requestId => api.startTask(id, requestId)),
        pause: () => command(requestId => api.pauseFocus(requestId)),
        complete: (id: number) => command(requestId => api.completeTask(id, requestId)),
    };
}
