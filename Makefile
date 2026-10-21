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
	  'NeuroDrive — comandos locais' \
	  '' \
	  'make dev         Instala dependencias, se necessario, e inicia o app' \
	  'make run         Alias de make dev' \
	  'make install     Reinstala as dependencias com npm ci' \
	  'make test        Executa os testes automatizados' \
	  'make build       Verifica TypeScript e gera dist/' \
	  'make check       Executa testes e build' \
	  'make preview     Compila e serve a versao de producao' \
	  'make experiment  Executa o experimento em cenario fixo' \
	  'make compare     Compara treino fixo e diverso' \
	  'make clean       Remove apenas dist/' \
	  '' \
	  'Exemplos: make dev PORT=5174 | make preview PREVIEW_PORT=4174' \
	  '          make experiment GENERATIONS=10 SEEDS=42 LAPS=1' \
	  '          make compare DIVERSITY_GENERATIONS=6 SEEDS=42 POPULATION=40' \
	  '' \
	  'Experimentos gravam resultados em results/; consulte o README.'

check-tools:
	@command -v node >/dev/null 2>&1 || { printf '%s\n' 'Instale Node.js 22.12+ para continuar.'; exit 1; }
	@command -v "$(NPM)" >/dev/null 2>&1 || { printf '%s\n' 'npm nao encontrado. Instale Node.js com npm.'; exit 1; }
	@node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22||(major===22&&minor<12)){console.error("Use Node.js 22.12+; encontrado "+process.version);process.exit(1);}'

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
