import { formatDuration } from "./HistoryScreen";

test.each([
    [0, "0초"], [59, "59초"], [60, "1분"], [65, "1분 5초"],
    [3600, "1시간"], [5400, "1시간 30분"], [5465, "1시간 31분 5초"],
])("formats %s seconds without dropping recorded seconds", (seconds, expected) => {
    expect(formatDuration(Number(seconds))).toBe(expected);
});
