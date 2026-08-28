#!/usr/bin/env node

import { constants } from 'node:fs';
import { access, copyFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const help = `Install the optional elm-websearch skill for OpenCode.

Usage:
  npx opencode-elm-websearch [--force]

Options:
  --force  Replace an existing elm-websearch skill
  --help   Show this help
`;

const argumentsSet = new Set(process.argv.slice(2));
if (argumentsSet.has('--help') || argumentsSet.has('-h')) {
  process.stdout.write(help);
  process.exit(0);
}

const unknownArguments = [...argumentsSet].filter((argument) => argument !== '--force');
if (unknownArguments.length > 0) {
  process.stderr.write(`Unknown argument: ${unknownArguments[0]}\n\n${help}`);
  process.exit(1);
}

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config');
const target = join(configRoot, 'opencode', 'skills', 'elm-websearch', 'SKILL.md');
const source = fileURLToPath(new URL('../skills/elm-websearch/SKILL.md', import.meta.url));

try {
  await access(target, constants.F_OK);
  if (!argumentsSet.has('--force')) {
    throw new Error(`${target} already exists; use --force to replace it`);
  }
} catch (error) {
  if (error instanceof Error && !('code' in error)) {
    throw error;
  }
}

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
process.stdout.write(`Installed elm-websearch skill at ${target}\n`);
