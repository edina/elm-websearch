import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Plugin, Skill, type WebSearch } from '@opencode/plugin';

const DEFAULT_ELM_API_BASE_URL = 'https://elm.edina.ac.uk/api/v1';

type ElmWebsearchArgs = {
  query: string;
  depth?: 'fast' | 'standard' | 'deep';
  max_results?: number;
  include_domains?: string[];
  exclude_domains?: string[];
  from_date?: string;
  to_date?: string;
};

async function requireApiKey(integration: Plugin.Context['integration']): Promise<string> {
  const connection = await integration.connection.active('elm');
  if (connection) {
    const credential = await integration.connection.resolve(connection);
    if (credential?.type === 'key' && credential.key.trim()) {
      return credential.key.trim();
    }
  }

  const value = process.env.ELM_API_KEY?.trim();
  if (!value) {
    throw new Error('Connect University of Edinburgh ELM in OpenCode using the models plugin, or set ELM_API_KEY before starting OpenCode');
  }
  return value;
}

function validateDateRange(fromDate?: string, toDate?: string): void {
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error('from_date must be on or before to_date');
  }
}

async function search(args: ElmWebsearchArgs, integration: Plugin.Context['integration'], signal?: AbortSignal) {
  validateDateRange(args.from_date, args.to_date);
  const baseURL = (process.env.ELM_API_BASE_URL?.trim() || DEFAULT_ELM_API_BASE_URL).replace(/\/+$/, '');
  const depth = args.depth ?? 'standard';
  const response = await fetch(`${baseURL}/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await requireApiKey(integration)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: args.query,
      depth,
      outputType: 'searchResults',
      maxResults: args.max_results ?? 10,
      ...(args.include_domains ? { includeDomains: args.include_domains } : {}),
      ...(args.exclude_domains ? { excludeDomains: args.exclude_domains } : {}),
      ...(args.from_date ? { fromDate: args.from_date } : {}),
      ...(args.to_date ? { toDate: args.to_date } : {}),
    }),
    signal: AbortSignal.any([AbortSignal.timeout(180_000), ...(signal ? [signal] : [])]),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Web search failed with HTTP ${response.status}: ${responseText.slice(0, 2_000)}`);
  }
  return { responseText, depth };
}

function publicationTime(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return undefined;
  return timestamp;
}

function searchResults(responseText: string): WebSearch.Result[] {
  const response: unknown = JSON.parse(responseText);
  if (!response || typeof response !== 'object' || !('results' in response) || !Array.isArray(response.results)) {
    throw new Error('ELM search response must contain a results array');
  }
  return response.results.map((result: unknown) => {
    if (!result || typeof result !== 'object') {
      throw new Error('ELM search result must be an object');
    }
    const source = result as Record<string, unknown>;
    const url = source.url ?? source.link;
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('ELM search result must contain a URL');
    }
    const title = source.title ?? source.name;
    const content = source.raw_content ?? source.content ?? source.snippet;
    const published = publicationTime(source.publishedAt);
    return {
      url,
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof content === 'string' ? { content } : {}),
      time: published === undefined ? {} : { published },
    };
  });
}

const elmWebsearch = {
  name: 'elm-websearch',
  description:
    'Search the public web through the University of Edinburgh ELM API. Use for recent facts, news, changing documentation, verification, recommendations, or answers requiring source links. Returns ranked source names, URLs, and content.',
  input: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        description: 'A focused natural-language web search query',
      },
      depth: {
        type: 'string',
        enum: ['fast', 'standard', 'deep'],
        description:
          'Search depth; defaults to standard. Use fast for short keyword-style lookups and deep only for complex multi-step research.',
      },
      max_results: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Maximum number of sources to return; defaults to 10',
      },
      include_domains: {
        type: 'array',
        maxItems: 100,
        items: { type: 'string', minLength: 1 },
        description: 'Only return results from these domains',
      },
      exclude_domains: {
        type: 'array',
        maxItems: 100,
        items: { type: 'string', minLength: 1 },
        description: 'Exclude results from these domains',
      },
      from_date: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'Only return results on or after this YYYY-MM-DD date',
      },
      to_date: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'Only return results on or before this YYYY-MM-DD date',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

function createElmWebsearch(integration: Plugin.Context['integration']) {
  return {
    ...elmWebsearch,
    async execute(
      input: unknown,
      context: { signal: AbortSignal; progress(update: Record<string, unknown>): Promise<void> },
    ) {
      const args = input as ElmWebsearchArgs;
      await context.progress({
        title: `Web search: ${args.query}`,
        depth: args.depth ?? 'standard',
      });
      const { responseText, depth } = await search(args, integration, context.signal);

      try {
        const result: unknown = JSON.parse(responseText);
        return { content: JSON.stringify(result, null, 2), metadata: { depth } };
      } catch {
        return { content: responseText, metadata: { depth } };
      }
    },
  };
}

const skillPath = fileURLToPath(new URL('../skills/elm-websearch/SKILL.md', import.meta.url));

export const ElmWebsearchPlugin = Plugin.define({
  id: 'elm-websearch',
  async setup(context) {
    const skillMarkdown = await readFile(skillPath, 'utf8');
    const skillContent = skillMarkdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

    await context.skill.transform((draft) => {
      draft.add(
        Skill.Info.make({
          id: Skill.ID.make('elm-websearch'),
          name: Skill.Name.make('elm-websearch'),
          description:
            'Search the public web with the ELM web-search tool for current, unfamiliar, or citation-backed information.',
          autoinvoke: true,
          path: skillPath as Skill.Info['path'],
          content: skillContent,
        }),
      );
    });

    await context.tool.transform((draft) => {
      draft.add(createElmWebsearch(context.integration));
    });

    await context.websearch.transform((draft) => {
      draft.add({
        id: 'elm',
        name: 'University of Edinburgh ELM',
        async execute(input, { signal }) {
          const { responseText } = await search(input, context.integration, signal);
          return searchResults(responseText);
        },
      });
    });
  },
});

export default ElmWebsearchPlugin;
