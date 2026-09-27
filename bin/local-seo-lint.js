#!/usr/bin/env node
'use strict';
const path = require('path');
const { lint } = require('../src');
const { pretty, github } = require('../src/report');

const HELP = `Usage: local-seo-lint [folder] [options]

Checks a static website folder for local SEO problems.

Options:
  --config <file>        Config file (default: .localseorc.json in the folder)
  --ignore <glob>        Skip files/folders (repeatable), e.g. --ignore "drafts/**"
  --format <pretty|json|github>   Output format (default: pretty)
  --limit <n>            Max findings shown per rule in pretty output (0 = all, default 10)
  --max-warnings <n>     Fail if there are more than n warnings (default: no limit)
  --no-color             Disable colors
  -h, --help             Show this help
  -v, --version          Show version

Exit code: 1 if any errors (or too many warnings), otherwise 0.`;

function main(argv) {
  const args = { ignore: [], format: 'pretty', limit: 10, color: process.stdout.isTTY };
  let dir = '.';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '-h' || a === '--help') { console.log(HELP); return 0; }
    else if (a === '-v' || a === '--version') { console.log(require('../package.json').version); return 0; }
    else if (a === '--config') args.config = val();
    else if (a === '--ignore') args.ignore.push(val());
    else if (a === '--format') args.format = val();
    else if (a === '--limit') args.limit = parseInt(val(), 10) || Infinity;
    else if (a === '--max-warnings') args.maxWarnings = parseInt(val(), 10);
    else if (a === '--no-color') args.color = false;
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
    else dir = a;
  }
  const root = path.resolve(dir);
  const res = lint(root, { config: args.config, ignore: args.ignore });
  if (args.format === 'json') console.log(JSON.stringify(res, null, 2));
  else if (args.format === 'github') { const g = github(res, path.relative(process.cwd(), root)); if (g) console.log(g); console.log(pretty(res, { color: false, limit: args.limit })); }
  else console.log(pretty(res, { color: args.color, limit: args.limit }));
  if (res.errors > 0) return 1;
  if (Number.isFinite(args.maxWarnings) && res.warnings > args.maxWarnings) return 1;
  return 0;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (e) { console.error('local-seo-lint: ' + e.message); process.exitCode = 2; }
