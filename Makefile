.DEFAULT_GOAL := help

NPM ?= npm
HOST ?= 127.0.0.1
PORT ?= 5173
PREVIEW_PORT ?= 4173
GENERATIONS ?= 40
SEEDS ?= neurodrive,42,2026
TRACK ?= oval
LAYERS ?= 12
LAPS ?= 3
LAYOUT ?= barriers
DIVERSITY_GENERATIONS ?= 24
POPULATION ?= 40

.PHONY: help check-tools install deps dev run test build check preview experiment compare clean

help:
	@printf '%s\n' \
	  'NeuroDrive — local commands' \
	  '' \
	  'make dev         Installs dependencies if needed and starts the app' \
	  'make run         Alias for make dev' \
	  'make install     Reinstalls dependencies with npm ci' \
	  'make test        Runs automated tests' \
	  'make build       Checks TypeScript and builds dist/' \
	  'make check       Runs tests and the build' \
	  'make preview     Builds and serves the production version' \
	  'make experiment  Runs the fixed-scenario experiment' \
	  'make compare     Compares fixed and diverse training' \
	  'make clean       Removes only dist/' \
	  '' \
	  'Examples: make dev PORT=5174 | make preview PREVIEW_PORT=4174' \
	  '          make experiment GENERATIONS=10 SEEDS=42 LAPS=1' \
	  '          make compare DIVERSITY_GENERATIONS=6 SEEDS=42 POPULATION=40' \
	  '' \
	  'Experiments write to results/; see the README for details.'

check-tools:
	@command -v node >/dev/null 2>&1 || { printf '%s\n' 'Install Node.js 22.12+ to continue.'; exit 1; }
	@command -v "$(NPM)" >/dev/null 2>&1 || { printf '%s\n' 'npm was not found. Install Node.js with npm.'; exit 1; }
	@node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22||(major===22&&minor<12)){console.error("Use Node.js 22.12+; found "+process.version);process.exit(1);}'

install: check-tools
	$(NPM) ci

node_modules/.package-lock.json: package.json package-lock.json | check-tools
	$(NPM) ci

deps: node_modules/.package-lock.json

dev: deps
	$(NPM) run dev -- --host "$(HOST)" --port "$(PORT)" --strictPort

run: dev

test: deps
	$(NPM) test

build: deps
	$(NPM) run build

check: test build

preview: build
	$(NPM) run preview -- --host "$(HOST)" --port "$(PREVIEW_PORT)" --strictPort

experiment: deps
	$(NPM) run experiment -- "$(GENERATIONS)" "$(SEEDS)" "$(TRACK)" "$(LAYERS)" "$(LAPS)" "$(LAYOUT)"

compare: deps
	node --import tsx scripts/compare-diversity.ts "$(DIVERSITY_GENERATIONS)" "$(SEEDS)" "$(POPULATION)"

clean:
	rm -rf dist
