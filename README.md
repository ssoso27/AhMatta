# AhMatta

새 요청 때문에 멈춘 일을 잊지 않고 다시 시작하도록 돕는 개인 작업 기록 앱입니다.

첫 구현 단계로 FastAPI API와 Vite/React 화면을 제공합니다.

- [제품 설계](docs/design.md)
- [화면 설계 기준](docs/ui-design.md)

첫 구현 목표는 빠른 작업 등록, A→B 작업 전환, 중단 작업 재개, 날짜별 작업 기록입니다.

## Local development

Python 3.12 이상, [uv](https://docs.astral.sh/uv/), Node.js 22.22.2 이상(22.x),
24.15.0 이상(24.x), 또는 26 이상과 npm이 필요합니다.

```bash
uv sync --group dev
npm --prefix frontend ci
```

API 개발 서버를 시작합니다.

```bash
make dev-api
```

별도 터미널에서 프런트엔드 개발 서버를 시작합니다. `/api` 요청은
`http://127.0.0.1:8000`으로 전달됩니다.

```bash
npm --prefix frontend run dev
```

전체 테스트와 정적 검사는 다음 명령으로 실행합니다.

```bash
make test
make lint
```

API 상태 확인은 `GET /api/health`이며, 응답은 `{"status":"ok"}`입니다.

## Browser verification

처음 한 번 Chromium을 설치한 뒤 브라우저 검증을 실행합니다.

```bash
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

`uv sync --group dev`로 만든 프로젝트 `.venv`가 필요합니다. 테스트는
`127.0.0.1:18742`(API), `127.0.0.1:18743`(Vite)를 사용하므로 두 포트를 비워 두세요.
기존 서버를 재사용하지 않으며 한 worker에서 순서대로 실행합니다. `--workers` 값을
늘리지 마세요. 테스트마다 새 임시 SQLite DB와 API 프로세스를 만들고 종료 후 삭제합니다.
Vite와 확대 검증용 브라우저도 실행이 끝나면 종료합니다. 평소 사용하는 DB는 건드리지 않습니다.

A→B→C→A, 멈춤·완료·기록·실제 클립보드 복사, 키보드와 포커스,
400×760·360×760 화면, 200% 브라우저 확대, 텍스트 간격과 axe를 검사합니다.
200% 확대는 번들 Chromium의 테스트용 확장에서 `chrome.tabs.setZoom(2)`로 적용하고
실제 확대율·CSS 화면 너비·DPR 변화를 검증합니다. 이 확장은 테스트 브라우저에만 설치됩니다.

스크린샷과 HTML 결과는 Git에서 제외한 `output/playwright/`에 저장합니다.
검증 범위와 미확인 항목은 [화면 검증 기록](docs/ui-design.md)에 있습니다.

전체 검증:

```bash
uv run pytest backend/tests -q && uv run ruff check backend && uv run mypy backend/ahmatta && npm --prefix frontend test -- --run && npm --prefix frontend run build && npm --prefix frontend run test:e2e
```
