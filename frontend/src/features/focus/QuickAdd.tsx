import type { RefObject } from "react";

interface Props {
    title: string;
    onTitle: (title: string) => void;
    onAdd: (start: boolean) => void;
    disabled: boolean;
    inputRef: RefObject<HTMLInputElement | null>;
}
export function QuickAdd({ title, onTitle, onAdd, disabled, inputRef }: Props) {
    return <form className="quick-add" onSubmit={event => { event.preventDefault(); onAdd(false); }}>
        <label htmlFor="quick-title">새 작업</label>
        <input ref={inputRef} id="quick-title" value={title} maxLength={500}
            onChange={event => onTitle(event.target.value)} placeholder="할 일을 적어 주세요" autoComplete="off" />
        <div className="add-actions">
            <button type="submit" disabled={disabled || !title.trim()}>추가</button>
            <button type="button" className="primary" disabled={disabled || !title.trim()} onClick={() => onAdd(true)}>추가하고 시작</button>
        </div>
    </form>;
}
