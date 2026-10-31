# Contributing to mdSilo

Thank you for considering contributing to mdSilo! We welcome your contributions to help make this note app even better.

Before you start contributing, please take a moment to read and understand this document to ensure a smooth collaboration process.

## Table of Contents
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Coding Guidelines](#coding-guidelines)
- [Submitting Changes](#submitting-changes)
- [Community and Communication](#community-and-communication)
- [License](#license)

## Getting Started

Before you can start contributing to mdSilo, make sure you have the following prerequisites:

- [Node.js](https://nodejs.org/en/download) and [pnpm](https://pnpm.io/installation) installed (`corepack enable` sets up the version in `package.json`)
- [Rust](https://www.rust-lang.org/tools/install) and Cargo Installed
- [Git](https://git-scm.com/downloads) installed
- Familiarity with [Tauri](https://tauri.app/) and [React](https://react.dev/)

Now, follow these steps:

1. Fork the [mdSilo repository](https://github.com/mdsilo/mdSilo-app) on GitHub.
2. Clone your forked repository to your local machine.
3. Install project dependencies by running `pnpm install` in the project root.
4. Start the development server with `pnpm tauri dev`.
5. Make your changes, create new features, or fix bugs.

## How Can I Contribute?

You can contribute to mdSilo in several ways:

- Report bugs and suggest improvements by opening issues.
- Submit pull requests to add new features or fix existing issues.
- Participate in discussions and provide feedback on existing issues and pull requests.

## Coding Guidelines

Please follow these guidelines when contributing code to mdSilo:

- Follow the coding style and conventions used in the project.
- Write clear and concise code with appropriate comments where necessary.
- Ensure your changes do not introduce linting errors or break existing functionality.
- Test your changes thoroughly before submitting a pull request.
- Tests sit next to the code they test (`foo.ts` and `foo.test.ts`), fixtures in a `__fixtures__` folder nearby. Tests of a package in `packages/` stay in that package. `pnpm test` runs them all with Vitest (jsdom, setup in `src/setupTests.ts`).
- Import across folders of `src/` with the `@/` alias (`@/lib/helper`), within a folder with relative paths.

### Source layout

| Folder | Content |
|---|---|
| `src/ui` | shared UI components |
| `src/state` | global store, view state, persisted settings |
| `src/workspace` | files on disk: read, write, process, layout, migration |
| `src/host` | host adapters; `host/web` stands in for the Tauri APIs in the web version |
| `src/lib` | helpers, the note model (parsing, links), shared hooks |
| `src/shell` | app skeleton: main view, sidebar, status bar, settings |
| `src/writer` | note editor |
| `src/reader` | ebook reader |
| `src/issue` | issues, milestones, projects |
| `src/feed` | feeds and podcasts |
| `src/sync` | git sync of the workspace (the git side is `src-tauri/src/sync`) |
| `src/publish` | the static site: what to publish, export, push to GitHub Pages; the generator is `packages/publish` |
| `src/insight` | views across features: graph, chronicle, heatmap, tags, journals |

Inside `src/reader`, the reading engine (opening books, the view, store, settings, styles, page turning) and the reading view's components (`components/`) are at the top; each feature has its own folder with its logic, components and tests: `library`, `annotations` (notes, links, range handles), `lookup`, `vocabulary`, `translation`, `tts`, `media`, `convert` (files and feed articles made EPUBs). A feature's main module is named after its folder (`tts/tts.ts`, imported as `@/reader/tts/tts`).

Shared folders (`ui`, `state`, `workspace`, `host`, `lib`) should not import from the feature folders or `shell`. Known exceptions to clean up: the settings and store in `state/` (reader settings, activity), workspace migration (issue files) and `workspace/useOpen` (feed sync).

## Submitting Changes

To submit your changes, follow these steps:

1. Create a new branch for your changes: `git checkout -b my-feature-branch`.
2. Commit your changes with descriptive commit messages.
3. Push your changes to your forked repository: `git push origin my-feature-branch`.
4. Open a pull request on the [mdSilo repository](https://github.com/mdSilo/mdSilo-app) with details about your changes.

A maintainer will review your pull request, provide feedback, and merge it once it meets the project's standards.

## Community and Communication

We value and encourage open communication within the mdSilo community:

- Join our [Discord server](https://discord.gg/EXYSEHRTFt) to interact with other contributors and users.
- Participate in discussions on GitHub issues and pull requests.
- Follow us on social media for updates and announcements.

## License

By contributing to mdSilo, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).

## Code of Conduct

Please note that mdSilo follows the Contributor Covenant [Code of Conduct](CODE_OF_CONDUCT.md). Please review and adhere to it in all your interactions with the project.

## Thank You

Thank you for contributing to mdSilo. Your contributions help make this project better for everyone. We appreciate your time and effort in helping us achieve our goals.

Happy coding!  
