---
name: example
description: Smoke-test kit for agentscripts. Use to check that the extension, host and MCP endpoint are wired: reads the title and text of example.com.
---

# example kit

Call `example.page_title` first. If it returns a title, the whole chain works: agent, host, extension, tab, tool.

## Tools

<!-- tools:begin (generated from manifest.json by scripts/gen-skill.js) -->
- `example.page_title`: Return the title and URL of the example.com page.
- `example.page_text` (max_chars?: integer): Return the visible text of the example.com page, trimmed to max_chars.
- `example.egress_probe`: Diagnostic: tries a cross-origin fetch from the tool world and reports whether the runtime blocked it.
<!-- tools:end -->
