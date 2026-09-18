import { render, screen } from "@testing-library/react";
import { Timeline } from "./Timeline";

test.each([
    ["2026-03-08", 82800, "2026-03-08T05:00:00Z", 8.695652173913043],
    ["2026-11-01", 90000, "2026-11-01T04:00:00Z", 8],
])("two-hour grid spacing matches elapsed-time ticks on %s", (date, seconds, start, spacing) => {
    const { container } = render(<Timeline history={{ date: String(date), timezone: "America/New_York", day_start: String(start), day_seconds: Number(seconds), total_seconds: 60,
        rows: [{ task_id: 1, title: "DST 작업", status: "done", color_key: null, total_seconds: 60,
            segments: [{ session_id: 1, started_at: String(start), ended_at: String(start), local_start: `${date}T00:00:00`, local_end: `${date}T00:01:00`, start_minute: 0, end_minute: 1 }] }] }} />);
    const tracks = container.querySelector<HTMLElement>(".timeline-tracks")!;
    expect(parseFloat(tracks.style.getPropertyValue("--timeline-tick-spacing"))).toBeCloseTo(Number(spacing));
    const ticks = screen.getByRole("region", { name: "작업 시간표" }).querySelectorAll<HTMLElement>(".timeline-tracks .timeline-axis span");
    expect(parseFloat(ticks[1].style.left)).toBeCloseTo(Number(spacing));
});
