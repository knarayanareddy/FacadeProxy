SHELL := /bin/bash
EXT_DIR := extension
PROXY_DIR := proxy
DIST_DIR := dist
PROXY_BIN_NAME := facadeproxy
ifeq ($(OS),Windows_NT)
	PROXY_TARGET := $(DIST_DIR)/proxy/$(PROXY_BIN_NAME).exe
	CARGO_BIN := $(PROXY_DIR)/target/release/$(PROXY_BIN_NAME).exe
else
	PROXY_TARGET := $(DIST_DIR)/proxy/$(PROXY_BIN_NAME)
	CARGO_BIN := $(PROXY_DIR)/target/release/$(PROXY_BIN_NAME)
endif

.PHONY: all bootstrap ext ext-firefox proxy proxy-debug proxy-all test test-ext test-proxy test-e2e lint typecheck fmt clippy dev release clean

all: ext proxy

bootstrap:
	npm --prefix $(EXT_DIR) install

ext:
	npm --prefix $(EXT_DIR) install
	npm --prefix $(EXT_DIR) run build
	mkdir -p $(DIST_DIR)
	rm -rf $(DIST_DIR)/extension
	cp -R $(EXT_DIR)/dist $(DIST_DIR)/extension

ext-firefox:
	npm --prefix $(EXT_DIR) install
	npm --prefix $(EXT_DIR) run build:firefox
	mkdir -p $(DIST_DIR)
	rm -rf $(DIST_DIR)/extension-firefox
	cp -R $(EXT_DIR)/dist $(DIST_DIR)/extension-firefox

proxy:
	cargo build --manifest-path $(PROXY_DIR)/Cargo.toml --release
	mkdir -p $(DIST_DIR)/proxy
	cp $(CARGO_BIN) $(PROXY_TARGET)

proxy-debug:
	cargo build --manifest-path $(PROXY_DIR)/Cargo.toml

proxy-all:
	@echo "Cross-compilation is platform/toolchain dependent. Building current target."
	$(MAKE) proxy

test: test-ext test-proxy

test-ext:
	npm --prefix $(EXT_DIR) install
	npm --prefix $(EXT_DIR) run lint
	npm --prefix $(EXT_DIR) run typecheck
	npm --prefix $(EXT_DIR) run test:unit

test-proxy:
	cargo test --manifest-path $(PROXY_DIR)/Cargo.toml --all-targets

test-e2e: all
	FACADEPROXY_PROXY_BIN=../$(DIST_DIR)/proxy/$(PROXY_BIN_NAME) npm --prefix $(EXT_DIR) run test:e2e

fmt:
	cargo fmt --manifest-path $(PROXY_DIR)/Cargo.toml --check

clippy:
	cargo clippy --manifest-path $(PROXY_DIR)/Cargo.toml --all-targets -- -D warnings

lint:
	npm --prefix $(EXT_DIR) run lint

typecheck:
	npm --prefix $(EXT_DIR) run typecheck

dev:
	@echo "Run these in separate terminals:"
	@echo "  cargo run --manifest-path $(PROXY_DIR)/Cargo.toml -- --personas personas/defaults/personas.toml --debug"
	@echo "  npm --prefix $(EXT_DIR) run dev"

release: clean all
	mkdir -p release/0.1.0
	cp -R $(DIST_DIR)/extension release/0.1.0/extension
	cp -R $(DIST_DIR)/proxy release/0.1.0/proxy
	(cd release/0.1.0 && find . -type f -print0 | xargs -0 shasum -a 256 > SHA256SUMS.txt)

clean:
	rm -rf $(DIST_DIR) release
	rm -rf $(EXT_DIR)/dist
	cargo clean --manifest-path $(PROXY_DIR)/Cargo.toml || true
