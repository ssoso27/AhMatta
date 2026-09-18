import { request } from "../../api/client";
import type { FocusApi } from "./types";

export function createFocusApi(): FocusApi {
    return {
        getFocus: () => request("/focus"),
        createTask: (input) => request("/tasks", input),
        startTask: (id, requestId) => request(`/tasks/${id}/start`, { request_id: requestId }),
        pauseFocus: (requestId) => request("/focus/pause", { request_id: requestId }),
        completeTask: (id, requestId) => request(`/tasks/${id}/complete`, { request_id: requestId }),
    };
}
export const focusApi = createFocusApi();
