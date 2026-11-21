# RE Backends

60+ decompiler and debugger bridges exposed by `decompile serve`.
Enumerate live:

```bash
decompile providers
```

## Lifecycle

```
list_re_backends            # see what's registered
pick_re_backend <target>    # recommended backend for this file type
launch_re_backend <id>      # start external process
re_backend_status <id>      # probe
<backend>_<action>          # per-backend tool
stop_re_backend <id>        # done
```

## Static analysis

| Backend | Highlights |
|---|---|
| `ghidra-mcp` | HeadlessAnalyzer bridge. `ghidra_decompile`, `ghidra_functions`, `ghidra_xrefs`, `ghidra_strings`, `ghidra_run_script`. |
| `superghidra-mcp` | Enhanced Ghidra with batch ops. |
| `ida-pro-mcp-hexrays` | IDA 8/9. `ida_decompile`, `ida_disasm`, `ida_xrefs`, `ida_strings`, `ida_functions`, `ida_rename`, `ida_run_script`. |
| `binary-ninja-mcp` | Binja Headless. `binja_decompile`, `binja_functions`, `binja_xrefs`, `binja_strings`, `binja_rename`. |
| `radare2-mcp` | Full r2 pipe. |
| `hopper-mcp` | macOS / iOS Mach-O preferred backend. |
| `cutter` | Rizin GUI. |
| `jadx-mcp` | Android DEX decompile. |
| `angr-mcp` | Symbolic exec. |
| `capstone-mcp` | Pure disasm, no analysis. |
| `reclass` | Struct discovery (`reclass_*`). |
| `dnspy` / `ilspy` | .NET decompile. |

## Dynamic analysis

| Backend | Highlights |
|---|---|
| `x64dbg-mcp` | Breakpoints, step, register / memory R/W. |
| `windbg-mcp` | Kernel + usermode. |
| `cheat-engine-mcp` | AOB, pointer scan, Lua. |
| `frida-mcp` | 14 ops: attach, trace, dump, inject, replace exports, hooks. |

## Specialized

| Backend | Highlights |
|---|---|
| `pcileech-mcp` | DMA via FPGA — read/write physical memory. |
| `memflow-mcp` | Live kernel introspection. |
| `volatility` | Memory forensics. |
| `wireshark` | pcap / live capture. |
| `mitmproxy` | Intercept TLS. |
| `burp` | Web app proxy. |
| `yara-mcp` | Rule scanning. |

## Composite

| Tool | Behavior |
|---|---|
| `smart_decompile` | Picks IDA if running, else Ghidra, else Binja, else radare2. Caches by content hash. |
| `hub_consensus_call` | Call the same action on N backends, return majority / voting. |
| `hub_call` | Call a specific backend. |
| `analyze_binary` | Multi-pass static sweep: PE/ELF parse + entropy + Rich Header + Debug Directory + imports + strings + crypto constants. |
| `compare_binaries` | Diff two binaries at symbol + section + function level. |

## Add your own

Backends live as entries in `src/retools.ts` under the `BACKENDS`
dictionary. Shape:

```ts
"my-backend": {
  id: "my-backend",
  name: "My Backend",
  kind: "static" | "dynamic" | "both",
  os: ["windows", "linux", "macos"],
  requires: "...",
  install: ["..."],
  launch: { cmd: "...", args: [...] },
  mcpConfig: { "my-backend": { command: "...", args: [...] } },
  tags: [...],
  notes: "...",
}
```

Add the id to the `ReBackendId` union. The server auto-exposes
`launch_re_backend my-backend` / `stop_re_backend` / `re_backend_status`.
