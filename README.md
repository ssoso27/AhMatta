# AhMatta

새 요청 때문에 멈춘 일을 잊지 않고 다시 시작하도록 돕는 개인 작업 기록 앱입니다.

첫 구현 단계로 FastAPI API와 Vite/React 화면을 제공합니다.

- [제품 설계](docs/design.md)
- [화면 설계 기준](docs/ui-design.md)

첫 구현 목표는 빠른 작업 등록, A→B 작업 전환, 중단 작업 재개, 날짜별 작업 기록입니다.

## Local development

Python 3.12 이상, [uv](https://docs.astral.sh/uv/), Node.js 22.12 이상과 npm이 필요합니다.

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
