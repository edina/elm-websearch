import { tool, type Plugin } from '@opencode-ai/plugin';

const DEFAULT_ELM_API_BASE_URL = 'https://elm.edina.ac.uk/api/v1';

function requireApiKey(): string {
  const value = process.env.ELM_API_KEY?.trim();
  if (!value) {
    throw new Error('ELM_API_KEY must be set before starting OpenCode');
  }
  return value;
}

function validateDateRange(fromDate?: string, toDate?: string): void {
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error('from_date must be on or before to_date');
  }
}

const elmWebsearch = tool({
  description:
    'Search the public web through the University of Edinburgh ELM API. Use for recent facts, news, changing documentation, verification, recommendations, or answers requiring source links. Returns ranked source names, URLs, and content.',
  args: {
    query: tool.schema.string().min(1).describe('A focused natural-language web search query'),
    depth: tool.schema
      .enum(['fast', 'standard', 'deep'])
      .optional()
      .describe(
        'Search depth; defaults to standard. Use fast for short keyword-style lookups and deep only for complex multi-step research.',
      ),
    max_results: tool.schema
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of sources to return; defaults to 10'),
    include_domains: tool.schema
      .array(tool.schema.string().min(1))
      .max(100)
      .optional()
      .describe('Only return results from these domains'),
    exclude_domains: tool.schema
      .array(tool.schema.string().min(1))
      .max(100)
      .optional()
      .describe('Exclude results from these domains'),
    from_date: tool.schema
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Only return results on or after this YYYY-MM-DD date'),
    to_date: tool.schema
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Only return results on or before this YYYY-MM-DD date'),
  },
  async execute(args, context) {
    validateDateRange(args.from_date, args.to_date);

    const baseURL = (process.env.ELM_API_BASE_URL?.trim() || DEFAULT_ELM_API_BASE_URL).replace(/\/+$/, '');
    const apiKey = requireApiKey();
    const requestBody = {
      q: args.query,
      depth: args.depth ?? 'standard',
      outputType: 'searchResults',
      maxResults: args.max_results ?? 10,
      ...(args.include_domains ? { includeDomains: args.include_domains } : {}),
      ...(args.exclude_domains ? { excludeDomains: args.exclude_domains } : {}),
      ...(args.from_date ? { fromDate: args.from_date } : {}),
      ...(args.to_date ? { toDate: args.to_date } : {}),
    };

    context.metadata({
      title: `Web search: ${args.query}`,
      metadata: { depth: requestBody.depth },
    });

    const signal = AbortSignal.any([context.abort, AbortSignal.timeout(180_000)]);
    const response = await fetch(`${baseURL}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Web search failed with HTTP ${response.status}: ${responseText.slice(0, 2_000)}`);
    }

    try {
      const result: unknown = JSON.parse(responseText);
      return {
        title: `Web search: ${args.query}`,
        output: JSON.stringify(result, null, 2),
        metadata: { depth: requestBody.depth },
      };
    } catch {
      return responseText;
    }
  },
});

export const ElmWebsearchPlugin: Plugin = async () => ({
  tool: {
    'elm-websearch': elmWebsearch,
  },
});
