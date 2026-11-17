# OpenCode ELM web search

An [OpenCode](https://opencode.ai/) plugin that adds a native web-search provider and an `elm-websearch` tool backed by the University of Edinburgh [ELM](https://elm.edina.ac.uk/) search API.

The tool supports fast, standard, and deep search, domain and date filters, and returns source URLs and content for citation-backed answers.

## Requirements

- OpenCode 2.3 or later
- The [`opencode-elm-models`](https://github.com/edina/opencode-elm-models) plugin
- An ELM API key with access to web search

## Install

Add the plugin to your global `~/.config/opencode/opencode.jsonc` or a project `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-elm-models", "opencode-elm-websearch"]
}
```

OpenCode installs npm plugins automatically when it starts.

The plugin registers its bundled `elm-websearch` skill automatically. The skill is active only while the plugin is enabled; no separate skill installation is required.

## Native web search

Choose **University of Edinburgh ELM** in OpenCode's web-search provider selector. The provider ID is `elm`. Installing the plugin adds this choice without changing your selected provider or enabling search if you disabled it.

You can also select it in `opencode.jsonc` alongside the `plugins` setting:

```jsonc
{
  "websearch": { "provider": "elm" }
}
```

Native web search accepts a query and uses standard depth with up to 10 results. It returns source URLs, titles, and content in OpenCode's search result format. Use the `elm-websearch` tool directly when you need depth, domain, or date filters.

## API key

Search reuses the active ELM credential from the models plugin. If you have already connected **University of Edinburgh ELM** for models, no additional key setup is needed.

Otherwise, run `/connect` in OpenCode, select **University of Edinburgh ELM**, choose **ELM API key**, and paste your key. You can also connect from the command line:

```sh
opencode auth login elm
```

OpenCode stores the key in its credential store. Both native search and the `elm-websearch` tool resolve the active credential on each request, so switching keys does not require restarting OpenCode.

If no usable key is available through that integration, search falls back to `ELM_API_KEY` in the OpenCode server's environment:

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

Use Node.js 22.19 or later.

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
