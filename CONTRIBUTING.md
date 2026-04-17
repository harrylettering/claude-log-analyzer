# Contributing to Claude Trace Replay

Thanks for helping improve Claude Trace Replay.

## Good First Contributions

- Add anonymized sample traces
- Improve README screenshots or documentation
- Fix parser edge cases for Claude Code JSONL entries
- Improve Agent Flow layout and animation behavior
- Add tests or validation cases for trace parsing

## Local Development

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run build
```

If your change touches linted code, also run:

```bash
npm run lint
```

## Pull Request Guidelines

- Keep PRs focused on one feature or fix.
- Include screenshots or short recordings for visual changes.
- Describe the Claude Code trace shape or sample scenario that motivated parser changes.
- Avoid committing private session traces, API keys, or personally identifiable data.

## Reporting Issues

When reporting a bug, please include:

- What you expected to happen
- What happened instead
- Browser and operating system
- Whether the issue happens with all traces or one specific trace shape
- A sanitized sample trace snippet when possible
