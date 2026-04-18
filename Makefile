.PHONY: build test

build:
	@echo "No build step required."

test:
	node --test test/survey.test.js
