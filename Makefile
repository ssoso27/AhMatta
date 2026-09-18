.PHONY: dev-api lint test

dev-api:
	uv run uvicorn ahmatta.main:app --reload

lint:
	uv run ruff check backend
	npm --prefix frontend run lint

test:
	uv run pytest
	npm --prefix frontend test -- --run
