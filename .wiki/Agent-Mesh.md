# Agent Mesh

`decompile` ships a persistent multi-agent mesh so Claude, Codex,
Cursor, DeepSeek, etc. can coordinate on the same task. Zero-dep JSON
persistence under `$MCP_AGENT_MESH_DIR` (defaults to
`.agent-mesh/`).

## Primitives

### Agents

```
mesh_agent_register name capabilities
mesh_agent_list [channel]
mesh_agent_heartbeat name
```

Each agent announces itself with a name + capabilities array. Heartbeats
every N seconds mark it as alive.

### DM + channels

```
mesh_send to from message [channel?]
mesh_read since? limit? [channel?]
```

Channels are flat strings. `#global` is the default. Messages persist
across sessions.

### Tasks

```
mesh_task_create title body owner? reviewers?
mesh_task_update id status? body? assignee?
mesh_task_list status?
mesh_task_vote id vote comment?
```

Reviewer agents can vote; a quorum rule in `mesh_orchestrate` can
auto-advance status.

### Shared KV knowledge base

```
mesh_kb_set key value [ttl_seconds?]
mesh_kb_get key
```

For cross-session "I already solved this" notes. Supports TTL so
transient findings expire.

### Named locks

```
mesh_lock_acquire resource holder ttl_seconds
mesh_lock_release resource token
mesh_lock_list
```

Token-based release — a held lock auto-expires after TTL if the holder
dies.

### Orchestration

```
mesh_orchestrate kind params
```

Composite that can:

- Round-robin a task across registered agents
- Collect N opinions on the same question, return majority
- Hand off: owner creates a task + locks + pings reviewers

## Use cases

- **Checkpoint handoff**: when context runs low, call
  `mesh_kb_set checkpoint_$task {progress, next_steps, gotchas}` so
  the next session picks up without re-deriving.
- **Adversarial voting**: on a risky patch, send
  `mesh_orchestrate kind=consensus_vote ...` to get N agent takes.
- **Lock a backend**: before running `launch_re_backend ghidra`,
  `mesh_lock_acquire backend:ghidra holder=$self ttl_seconds=600` so
  two agents don't fight for the headless process.

## Memory (per-agent, persistent)

Separate from the mesh. Keyed by owner:

```
memory_put key value owner? tags?
memory_get key owner?
memory_list owner?
memory_search query owner?
memory_delete key owner?
memory_prune older_than_days
memory_stats
memory_export path
```

Memory is scoped per agent name by default — no cross-reads unless
`owner` is passed. Use this for **durable per-agent notes**
(preferences, "this project uses Y pattern", learned addresses).
