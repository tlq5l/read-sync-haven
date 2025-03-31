
# BondWise: A Local-First Read-It-Later Application

BondWise is a modern read-it-later application built with a local-first architecture. Save, organize, and read content from around the web, all while enjoying a fast, offline-capable reading experience.

## Project Overview

BondWise allows you to:

- Save web articles with a simple URL
- Read content in a clean, distraction-free environment
- Organize your reading list with favorites and read/unread states
- Use the application entirely offline
- Store all your content locally for fast access

## Core Technologies

- **React** and **TypeScript** for the frontend
- **PouchDB** for local-first data storage
- **Readability** for web content parsing
- **TailwindCSS** and **shadcn/ui** for styling
- **React Router** for navigation

## Local Development

To run this project locally:

```sh
# Clone the repository
git clone <repository-url>

# Navigate to the project directory
cd bondwise

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Running Tests

Tests are written using Vitest. Due to an incompatibility between Bun's built-in test runner (`bun test`) and the `jsdom` environment configuration in `vitest.config.ts`, tests requiring a DOM environment (like those for animation utilities) will fail if run with `bun test`.

**To run tests correctly, use:**

```sh
bunx vitest run
```

Alternatively, the `package.json` `test` script has been updated, so you can also run:

```sh
bun test
```

This command now correctly executes `vitest run` behind the scenes.

**Test Configuration Notes:**
- PouchDB tests use `pouchdb-adapter-memory` to provide an in-memory database during testing.
- Browser APIs like `window` and `document` are provided by the `jsdom` environment specified in `vitest.config.ts`.

## Project Structure

- `/src/components` - UI components
- `/src/pages` - Page components for routing
- `/src/services` - Core services (database, content parsing)
- `/src/context` - React context providers
- `/src/hooks` - Custom React hooks

## Technical Considerations

### Local-First Architecture

BondWise uses PouchDB to store all content locally in the browser, providing:

- Fast access to saved content
- Offline capability
- Future sync capability with remote CouchDB servers

### Content Parsing

The web content parser extracts clean, readable content from web pages using:

- Mozilla's Readability library
- DOMPurify for HTML sanitization
- TurndownService for HTML-to-Markdown conversion

## Roadmap

This is the MVP version of BondWise. Future enhancements will include:

- PDF support
- Highlighting and annotations
- Tagging and advanced organization
- Syncing between devices
- Mobile apps
- Browser extensions

## License

This project is private and not licensed for public use.
