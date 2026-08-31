# OpenCode ELM web search

An [OpenCode](https://opencode.ai/) plugin that adds an `elm-websearch` tool backed by the University of Edinburgh [ELM](https://elm.edina.ac.uk/) search API.

The tool supports fast, standard, and deep search, domain and date filters, and returns source URLs and content for citation-backed answers.

## Requirements

- OpenCode V2 with npm plugin support
- An ELM API key with access to web search

## Install

Add the plugin to your global `~/.config/opencode/opencode.jsonc` or a project `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-elm-websearch"]
}
```

OpenCode installs npm plugins automatically when it starts.

The plugin registers its bundled `elm-websearch` skill automatically. The skill is active only while the plugin is enabled; no separate skill installation is required.

Set the API key in the environment used to launch OpenCode:

```sh
export ELM_API_KEY="your-key"
opencode
```

Do not commit the key to a repository. The base URL defaults to `https://elm.edina.ac.uk/api/v1`. For development or another ELM deployment, set `ELM_API_BASE_URL` before starting OpenCode.

## Tool arguments

| Argument | Required | Description |
| --- | --- | --- |
| `query` | Yes | Focused web-search query |
| `depth` | No | `fast`, `standard` (default), or `deep` |
| `max_results` | No | Number of results, from 1 to 100; defaults to 10 |
| `include_domains` | No | Domains to include |
| `exclude_domains` | No | Domains to exclude |
| `from_date` | No | Earliest result date in `YYYY-MM-DD` format |
| `to_date` | No | Latest result date in `YYYY-MM-DD` format |

`fast` is best for short keyword-style lookups, `standard` for normal searches, and `deep` for complex multi-step research.

## Development

```sh
npm install
npm test
```

To test the unpublished plugin from a checkout, add its absolute directory to the `plugins` array in `opencode.jsonc`, then restart OpenCode.

## Publishing

Review the package contents before publishing:

```sh
npm pack --dry-run
npm publish
```

Releases follow [semantic versioning](https://semver.org/).

## License

MIT
