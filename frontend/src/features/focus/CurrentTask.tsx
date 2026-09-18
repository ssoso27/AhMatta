import type { ActiveTask } from "./types";
import { TaskDetails } from "./TaskList";

interface Props {
    task: ActiveTask | null;
    disabled: boolean;
    onPause: () => void;
    onComplete: (id: number) => void;
    onAdd: () => void;
}
export function CurrentTask({ task, disabled, onPause, onComplete, onAdd }: Props) {
    return <section aria-labelledby="current-heading" className={`current-work ${task ? "is-active" : ""}`}>
        <div className="section-heading">
            <h2 id="current-heading">지금 하는 일</h2>
            {task && <span className="secondary">진행 중 · {Math.floor(task.elapsed_seconds / 60)}분</span>}
        </div>
        {task ? <>
            <TaskDetails task={task} />
            <div className="current-actions">
                <button disabled={disabled} onClick={onPause}>잠시 멈추기</button>
                <button className="complete-button" disabled={disabled} onClick={() => onComplete(task.id)}>완료</button>
            </div>
        </> : <>
            <p className="current-empty-title">지금 하는 일 없음</p>
            <button className="text-button" onClick={onAdd}>작업 추가하기</button>
        </>}
    </section>;
}
