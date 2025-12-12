.PHONY: build build-linux build-mac build-windows build-all dev clean

# Version is extracted from git tag or set to dev
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
# -s strips symbol table, -w strips DWARF debug info (reduces size, avoids AV false positives)
LDFLAGS := -ldflags "-s -w -X github.com/mikejsmith1985/forge-terminal/internal/updater.Version=$(VERSION)"
LDFLAGS_WIN := -ldflags "-s -w -X github.com/mikejsmith1985/forge-terminal/internal/updater.Version=$(VERSION) -H windowsgui"

# Default target
build: frontend-build
	go build $(LDFLAGS) -o bin/forge ./cmd/forge

# Cross-compilation targets
build-linux: frontend-build
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/forge-linux-amd64 ./cmd/forge

build-mac-intel: frontend-build
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o bin/forge-darwin-amd64 ./cmd/forge

build-mac-arm: frontend-build
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o bin/forge-darwin-arm64 ./cmd/forge

build-windows: frontend-build
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS_WIN) -o bin/forge-windows-amd64.exe ./cmd/forge

build-all: frontend-build
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/forge-linux-amd64 ./cmd/forge
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o bin/forge-darwin-amd64 ./cmd/forge
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o bin/forge-darwin-arm64 ./cmd/forge
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS_WIN) -o bin/forge-windows-amd64.exe ./cmd/forge

# Frontend build
frontend-build:
	cd frontend && npm install && npm run build

# Development mode
dev:
	@echo "Starting frontend dev server..."
	cd frontend && npm run dev &
	@echo "Starting Go server..."
	go run ./cmd/forge

clean:
	rm -rf bin/ web/assets frontend/dist frontend/node_modules

