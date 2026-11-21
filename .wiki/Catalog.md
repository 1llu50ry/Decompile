# Catalog

Content library. Single source of truth: `db/skills.db` (SQLite +
FTS5).

## Counts (v6.0.0)

| Table | Rows |
|---|---|
| `skills` | 6,087 |
| `agents` | 194 |
| `subagents` | 163 |
| `plugins` | 193 |
| `prompts` | 3,349 |
| **Total** | **9,986** |

## Tools

### List + read

- `list_skills [prefix?]`, `read_skill name`
- `list_agents`, `read_agent name`
- `list_subagents`, `read_subagent name`
- `list_plugins [category?]`, `read_plugin category name`
- `list_prompts [category?]`, `read_prompt category name`

### Search

- `search_skills query [topics?]` — keyword match + topic filter.
- `db_search query` — FTS5 across every skill body.
- `grep_sources query` — regex over source blobs.
- `find_offset pattern` — cross-build offset lookup.
- `find_function query` — by name / signature / comment.
- `find_similar skill_name` — k-NN by body shape.

### Stats

- `skill_stats` — total + per-prefix breakdown.
- `db_stats` — row counts + size.
- `skill_changelog` — recent adds/updates.

## Prefixes

Skills are named by prefix so a `LIKE 'technique-%'` quickly isolates
a group.

| Prefix | What |
|---|---|
| `technique-` | Named RE / cheat / crack techniques (hand-written, English). |
| `ext-skill-` | Imported from external repos (content preserved, slugs neutral). |
| `ext-agent-` | External agent definitions. |
| `ext-subagent-` | External subagent definitions. |
| `ext-plugin-` | External plugin manifests + bodies. |
| `ext-prompt-` | External prompt templates. |
| `skill-` | In-house hand-written skills. |
| `ags-` | Archived auto-generated open-source skills (full source dump). |

## Why DB-first

The content trees (`skills/`, `agents/`, `subagents/`, `plugins/`,
`prompts/`) are gitignored. They're the pre-DB source of truth used
only by `scripts/build-db.mjs` when regenerating the DB. At runtime,
the server reads directly from `db/skills.db` via `safeRead` and the
per-table list/read tools.

Advantages:

- **One file ships**, not thousands of small `.md`.
- **Instant FTS** via SQLite FTS5 — sub-second search over 6,000+
  skills.
- **Dedup by SHA256** on ingest — no identical skill lives twice.
- **Content-addressable** — the DB is the diffable unit.
