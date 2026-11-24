# End-to-end (e2e) tests for web

Browser tests written in plain English for [Kane CLI](https://www.testmuai.com/kane-cli/), run against the web version.

| Test | What it covers |
|---|---|
| `note_test.md` | Creating a note, writing a tagged line, and finding it by tag and full-text search |
| `issue_test.md` | Creating an issue that links a note, then closing it |

## Run

The web version keeps its files in the browser, so each run starts from the Welcome note. From the repository root, serve the web build on port 4950:

```bash
yarn install
yarn build:web
yarn preview:web --port 4950
npm install -g @testmuai/kane-cli
kane-cli login
kane-cli testmd run e2e/kane/note_test.md
```
