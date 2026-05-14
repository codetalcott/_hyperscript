# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

**Testing:**
- `npm test` - Run the test suite using mocha-chrome on test/index.html
- View `test/index.html` in a browser to run tests interactively
- Individual test files are organized in test/ subdirectories (core/, commands/, expressions/, features/, etc.)

**Building:**
- `npm run dist` - Build distribution files (copies src/* to dist/, minifies, generates typings, creates gzip)
- `npm run terser` - Minify _hyperscript.js and hdb.js files
- `npm run typings` - Generate TypeScript declaration files using tsc

**Documentation:**
- `npm run www` - Build the website/documentation using Eleventy (in www/ directory)

## Architecture Overview

**Core Structure:**
- `src/_hyperscript.js` - The main monolithic file containing the entire hyperscript implementation
- This is a single-file architecture where the lexer, parser, runtime, and all language features are defined in one large file
- The parser uses an extensible grammar system with `addGrammarElement()`, `addCommand()`, `addFeature()`, and `addLeafExpression()` methods

**Language Components:**
- **Lexer class** - Tokenizes hyperscript source code (defines OP_TABLE for operators)
- **Parser system** - Extensible grammar-based parser that builds AST nodes
- **Runtime system** - Executes the parsed AST with async/sync transparency
- **Commands** - Action verbs like `add`, `remove`, `toggle`, `wait`, `fetch`, etc.
- **Expressions** - Value expressions like selectors, literals, function calls, etc.
- **Features** - Top-level constructs like `on`, `def`, `init`, `set`, `behavior`, etc.

**Extension Files:**
- `src/worker.js` - Web Workers support
- `src/socket.js` - WebSocket functionality  
- `src/template.js` - Template/string interpolation features
- `src/hdb.js` - Hyperscript debugger
- `src/eventsource.js` - Server-sent events support
- `src/ext/tailwind.js` - Tailwind CSS integration
- Node.js variants: `src/node-hyperscript.js`, `src/deno-hyperscript.js`

**Test Organization:**
- Tests mirror the source structure: test/core/, test/commands/, test/expressions/, test/features/
- All tests are included in test/index.html which loads the full test suite
- Tests use Mocha + Chai + Sinon testing framework

**Distribution:**
- Source files are copied to dist/ directory 
- Main entry points: `dist/_hyperscript.min.js` (browser), TypeScript definitions in `dist/_hyperscript.d.ts`
- Binary entry point: `src/node-hyperscript.js` for CLI usage

**Website/Docs:**
- Documentation source is in www/ directory, built with Eleventy
- Pull requests for features should target `dev` branch, docs fixes can go to `master`