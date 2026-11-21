# MCP Hub

The hub layer that lets `decompile` fan out to multiple backend MCP
servers behind one call.

## Tools

```
hub_connect host port? name?           # register an upstream MCP
hub_disconnect name
hub_list
hub_call name tool args                # one backend
hub_consensus_call tool args backends?  # fan out to N, return majority / all
smart_decompile path                   # auto-pick + fallback chain
```

## smart_decompile

The composite most users should call. Behavior:

1. Pick the preferred backend for the target file type
   (`pick_re_backend` under the hood).
2. If that backend is already running (`re_backend_status`), use it.
3. Else try to `launch_re_backend` it. If launch fails, fall back to
   the next-best backend for the same file type.
4. Call the decompile action.
5. Store the result under a content-hash key via the decompile cache
   (`decompile-cache.ts`). Subsequent calls on the same content hash
   return instantly.

Fallback chain (per file type):

| File type | Order |
|---|---|
| PE x86-64 | IDA → Ghidra → Binja → radare2 |
| ELF x86-64 | IDA → Ghidra → Binja → radare2 |
| Mach-O | Hopper → IDA → Ghidra → Binja → radare2 |
| DEX | JADX → Ghidra |
| WASM | Binja → radare2 |
| .NET | ilspy → dnspy → Ghidra |

## Consensus mode

```
hub_consensus_call tool=decompile args={"addr":"0x401000"} backends=["ghidra","ida","binja"]
```

Dispatches to each backend in parallel, scores the results, returns:

- The majority answer if N agree
- Or all results tagged with their backend when they diverge, for the
  caller to reconcile

Useful when a decompiler's output is suspect (e.g. heavy ORM / VM
protection where Ghidra's model differs from IDA's).

## Cache

`decompile-cache.ts` stores decompile outputs keyed by
`sha256(binary_bytes) + tool + args_hash`. Default location:
`.cache/decompile/`. Inspect with `cache_stats` / clear with
`cache_clear`.

Cache hits are reported in every tool response so the agent knows when
a result was reused rather than recomputed.
