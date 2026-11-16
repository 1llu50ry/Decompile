//! `analyze` / `inspect` — auto-detect file format and emit a structured
//! findings JSON. Mirrors the shape of the workflow contract:
//! `{target, kind, findings[{claim, evidence[{tool, ref, data}], confidence}], unknowns, limitations}`.

use anyhow::{Context, Result};
use serde::Serialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Serialize)]
struct Evidence<'a> {
    tool: &'a str,
    #[serde(rename = "ref")]
    reference: String,
    data: String,
}

#[derive(Serialize)]
struct Finding<'a> {
    claim: String,
    evidence: Vec<Evidence<'a>>,
    confidence: &'a str,
}

#[derive(Serialize)]
struct Report<'a> {
    target: String,
    kind: &'a str,
    findings: Vec<Finding<'a>>,
    unknowns: Vec<String>,
    limitations: Vec<String>,
}

pub fn run(path: &Path, shallow: bool) -> Result<()> {
    let meta = std::fs::metadata(path)
        .with_context(|| format!("not found: {}", path.display()))?;
    let mut report = Report {
        target: path.display().to_string(),
        kind: "unknown",
        findings: Vec::new(),
        unknowns: Vec::new(),
        limitations: Vec::new(),
    };

    if meta.is_dir() {
        report.kind = "directory";
        report.findings.push(Finding {
            claim: "target is a directory".into(),
            evidence: vec![Evidence {
                tool: "fs.metadata",
                reference: path.display().to_string(),
                data: format!("entries={}", count_entries(path)?),
            }],
            confidence: "high",
        });
        report.unknowns.push(
            "application type not identified — run `analyze` on a specific binary inside".into(),
        );
        emit(&report);
        return Ok(());
    }

    let mut f = File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut head = [0u8; 4096];
    let n = f.read(&mut head).unwrap_or(0);
    let head = &head[..n];

    // PE
    if head.len() > 0x40 && head[0] == 0x4D && head[1] == 0x5A {
        let pe_off = u32::from_le_bytes([head[0x3c], head[0x3d], head[0x3e], head[0x3f]]) as usize;
        if head.len() >= pe_off + 24 && &head[pe_off..pe_off + 4] == b"PE\0\0" {
            report.kind = "pe";
            report.findings.push(Finding {
                claim: "PE executable".into(),
                evidence: vec![Evidence {
                    tool: "header",
                    reference: format!("0x3c -> 0x{:x}", pe_off),
                    data: "MZ + PE\\0\\0".into(),
                }],
                confidence: "high",
            });
            let machine = u16::from_le_bytes([head[pe_off + 4], head[pe_off + 5]]);
            let arch = match machine {
                0x8664 => "x86_64",
                0x014c => "i386",
                0xAA64 => "arm64",
                _ => "unknown",
            };
            report.findings.push(Finding {
                claim: format!("arch 0x{:x}", machine),
                evidence: vec![Evidence {
                    tool: "header",
                    reference: format!("0x{:x}", pe_off + 4),
                    data: arch.into(),
                }],
                confidence: "high",
            });
            // OptionalHeader magic.
            if head.len() >= pe_off + 24 + 2 {
                let magic = u16::from_le_bytes([head[pe_off + 24], head[pe_off + 25]]);
                report.findings.push(Finding {
                    claim: if magic == 0x20B { "PE32+".into() } else { "PE32".into() },
                    evidence: vec![Evidence {
                        tool: "header",
                        reference: format!("0x{:x}", pe_off + 24),
                        data: format!("magic=0x{:x}", magic),
                    }],
                    confidence: "high",
                });
            }
            if !shallow {
                report.unknowns.extend([
                    "imports not parsed — call pe_imports_json via MCP".into(),
                    "sections not dumped — call pe_dump_sections".into(),
                    "no signer CN — call pe_signer_cn".into(),
                    "resources not walked — call pe_parse".into(),
                ]);
            }
            emit(&report);
            return Ok(());
        }
    }

    // ELF
    if head.len() >= 16 && head[0] == 0x7F && &head[1..4] == b"ELF" {
        let is64 = head[4] == 2;
        report.kind = "elf";
        report.findings.push(Finding {
            claim: format!("ELF{}", if is64 { "64" } else { "32" }),
            evidence: vec![Evidence {
                tool: "header",
                reference: "0x0".into(),
                data: "7F 45 4C 46".into(),
            }],
            confidence: "high",
        });
        let endian = if head[5] == 1 { "little-endian" } else { "big-endian" };
        report.findings.push(Finding {
            claim: endian.into(),
            evidence: vec![Evidence {
                tool: "header",
                reference: "0x5".into(),
                data: format!("ei_data=0x{:x}", head[5]),
            }],
            confidence: "high",
        });
        let machine = u16::from_le_bytes([head[0x12], head[0x13]]);
        let mach = match machine {
            0x3E => "x86_64",
            0x03 => "i386",
            0xB7 => "aarch64",
            0x28 => "arm",
            0xF3 => "riscv",
            _ => "unknown",
        };
        report.findings.push(Finding {
            claim: format!("arch {}", mach),
            evidence: vec![Evidence {
                tool: "header",
                reference: "0x12".into(),
                data: format!("e_machine=0x{:x}", machine),
            }],
            confidence: "high",
        });
        if !shallow {
            report.unknowns.extend([
                "sections/segments not dumped — call elf_parse via MCP".into(),
                "notes not walked — call elf_notes".into(),
                "DWARF not read — call dwarf_parse".into(),
            ]);
        }
        emit(&report);
        return Ok(());
    }

    // Mach-O
    if head.len() >= 4 {
        let m = u32::from_be_bytes([head[0], head[1], head[2], head[3]]);
        if matches!(m, 0xFEED_FACE | 0xFEED_FACF | 0xCAFE_BABE | 0xCFFA_EDFE | 0xCEFA_EDFE) {
            report.kind = "mach-o";
            report.findings.push(Finding {
                claim: "Mach-O".into(),
                evidence: vec![Evidence {
                    tool: "header",
                    reference: "0x0".into(),
                    data: format!("magic=0x{:08x}", m),
                }],
                confidence: "high",
            });
            if !shallow {
                report.unknowns.push("sections/load-commands not walked — call macho_parse".into());
            }
            emit(&report);
            return Ok(());
        }
    }

    // ZIP family (APK, JAR, IPA, docx, asar-zip)
    if head.len() >= 4 && &head[..4] == b"PK\x03\x04" {
        report.kind = "zip-like";
        report.findings.push(Finding {
            claim: "ZIP container (APK/JAR/IPA/office/asar-zip)".into(),
            evidence: vec![Evidence {
                tool: "magic",
                reference: "0x0".into(),
                data: "PK\\x03\\x04".into(),
            }],
            confidence: "medium",
        });
        if !shallow {
            report.unknowns.push("unpack via asar_* / apk_scan / dex_parse / zip_parse via MCP".into());
        }
        emit(&report);
        return Ok(());
    }

    // GGUF (ML model)
    if head.len() >= 4 && &head[..4] == b"GGUF" {
        report.kind = "gguf";
        report.findings.push(Finding {
            claim: "GGUF model artifact".into(),
            evidence: vec![Evidence {
                tool: "magic",
                reference: "0x0".into(),
                data: "GGUF".into(),
            }],
            confidence: "high",
        });
        if !shallow {
            report.unknowns.push("tensor metadata — call gguf_header via MCP".into());
        }
        emit(&report);
        return Ok(());
    }

    // BEAM (Erlang)
    if head.len() >= 12 && &head[..4] == b"FOR1" && &head[8..12] == b"BEAM" {
        report.kind = "beam";
        report.findings.push(Finding {
            claim: "Erlang BEAM module".into(),
            evidence: vec![Evidence {
                tool: "magic",
                reference: "0x0 / 0x8".into(),
                data: "FOR1 ... BEAM".into(),
            }],
            confidence: "high",
        });
        if !shallow {
            report.unknowns.push("chunks — call beam_parse via MCP".into());
        }
        emit(&report);
        return Ok(());
    }

    // WebAssembly
    if head.len() >= 8 && head[..4] == [0x00, 0x61, 0x73, 0x6D] {
        report.kind = "wasm";
        let ver = u32::from_le_bytes([head[4], head[5], head[6], head[7]]);
        report.findings.push(Finding {
            claim: "WebAssembly module".into(),
            evidence: vec![Evidence {
                tool: "magic",
                reference: "0x0".into(),
                data: format!("\\0asm v{}", ver),
            }],
            confidence: "high",
        });
        if !shallow {
            report.unknowns.push("sections — call wasm_parse via MCP".into());
        }
        emit(&report);
        return Ok(());
    }

    // Java class file
    if head.len() >= 4 && head[..4] == [0xCA, 0xFE, 0xBA, 0xBE] {
        // Note: Mach-O fat uses same magic but different layout; the branch above
        // tried big-endian 0xCAFEBABE which also matches here.
    }

    // Go buildinf sentinel. Only scan first ~1 MB from disk for performance.
    if let Ok(size) = f.seek(SeekFrom::End(0)) {
        let scan_len = size.min(1 << 20);
        let mut buf = vec![0u8; scan_len as usize];
        f.seek(SeekFrom::Start(0)).ok();
        if f.read_exact(&mut buf).is_ok() {
            let needle: &[u8] = b"\xffGo buildinf:";
            if let Some(idx) = find_subslice(&buf, needle) {
                report.kind = "go-binary";
                report.findings.push(Finding {
                    claim: "Go-compiled binary".into(),
                    evidence: vec![Evidence {
                        tool: "scan",
                        reference: format!("0x{:x}", idx),
                        data: "\\xff Go buildinf:".into(),
                    }],
                    confidence: "high",
                });
                if !shallow {
                    report.unknowns.push("module graph — call go_build_info via MCP".into());
                }
                emit(&report);
                return Ok(());
            }
        }
    }

    report.limitations.push("format not identified by first-4K signature or Go sentinel".into());
    report
        .unknowns
        .push("call file_identify / entropy_scan via MCP for deeper triage".into());
    emit(&report);
    Ok(())
}

fn emit(r: &Report) {
    println!("{}", serde_json::to_string_pretty(r).unwrap());
}

fn count_entries(p: &Path) -> Result<usize> {
    let mut n = 0;
    for _ in std::fs::read_dir(p)? {
        n += 1;
    }
    Ok(n)
}

fn find_subslice(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}
