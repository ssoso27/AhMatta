import { request } from "../../api/client";
import type { HistoryApi } from "./types";

export const historyApi: HistoryApi = {
    forDay: (date, timezone) => request(`/history?${new URLSearchParams({ date, timezone })}`),
};
