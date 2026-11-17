# Changelog

All notable changes to this project will be documented here.

## 0.3.0 - 2026-11-17

- Reuse the models plugin's active `elm` credential for both search entrypoints, with `ELM_API_KEY` as a fallback.
- Replace the beta `@opencode-ai/plugin` SDK with `@opencode/plugin` for OpenCode 2.3 compatibility.
- Update bundled skill registration to use the V2 `path` field.
- Register University of Edinburgh ELM (`elm`) in the native web-search provider selector.
- Forward cancellation from both search entrypoints to the ELM request.
- Require Node.js 22.19 or later for development and package loading.

## 0.1.0 - 2026-08-11

- Add the `elm-websearch` OpenCode tool.
- Add an optional global skill and installer.
- Default the API endpoint to `https://elm.edina.ac.uk/api/v1`.
