.PHONY: dev build deploy lint install

install:
	npm install

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

lint:
	npm run lint

deploy:
	npm run build
	netlify deploy --prod --dir=dist
