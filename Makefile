SHELL := /bin/sh
VERSION ?= dev
.PHONY: install dev fmt test verify e2e build smoke types types-check frontend sqlc sqlc-check
install:
	go mod download
	cd tools/sqlc && go mod download
	npm ci --prefix web
	npm exec --prefix web -- playwright install chromium

dev:
	@mkdir -p bin
	go build -o bin/myapp-dev ./cmd/app
	node scripts/dev.mjs

fmt:
	gofmt -w cmd internal
	npm run format --prefix web

types:
	node scripts/types.mjs

types-check:
	node scripts/types.mjs --check

sqlc:
	node scripts/sqlc.mjs

sqlc-check:
	node scripts/sqlc.mjs --check

frontend:
	npm run build --prefix web

build: frontend
	@mkdir -p bin
	CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$(VERSION)" -o bin/myapp ./cmd/app

test:
	go test ./cmd/... ./internal/...
	npm test --prefix web

verify: sqlc-check types-check
	node --test scripts/sqlc.test.mjs
	@test -z "$$(gofmt -l cmd internal)" || (gofmt -l cmd internal; exit 1)
	go vet ./cmd/... ./internal/...
	go test -race ./cmd/... ./internal/...
	npm run typecheck --prefix web
	npm run lint --prefix web
	npm run format:check --prefix web
	npm test --prefix web
	$(MAKE) build
	node scripts/smoke.mjs
	npm run e2e --prefix web

e2e: build
	npm run e2e --prefix web

smoke: build
	node scripts/smoke.mjs
