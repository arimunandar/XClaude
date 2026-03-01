# XClaude Architecture

XClaude is an iOS-specialized fork of [OpenAI Codex](https://github.com/openai/codex).
It preserves 100% of Codex's safety rules, tool definitions, and execution sandbox
constraints while adding a domain-specific identity layer.

---

## Prompt Layer Architecture

```
┌─────────────────────────────────┐  ← DOMAIN_IDENTITY_LAYER
│  ios_identity.md                │     (new, modifiable per domain)
│  Injected via developer_        │
│  instructions in ios.toml       │
└─────────────────────────────────┘
┌─────────────────────────────────┐  ← BASE_SAFETY_LAYER (DO NOT TOUCH)
│  client_common.rs include_str!  │     existing Codex safety rules,
│  (system_prompt text file)      │     refusal logic, harm prevention
└─────────────────────────────────┘
┌─────────────────────────────────┐  ← BASE_TOOLING_LAYER (DO NOT TOUCH)
│  client_common.rs include_str!  │     apply_patch, shell, file tools
│  (tool instructions text file)  │
└─────────────────────────────────┘
```

### Layer ownership

| Layer | Files | Who owns it |
|-------|-------|-------------|
| DOMAIN_IDENTITY_LAYER | `codex-rs/core/src/agent/builtins/ios_identity.md`<br>`codex-rs/core/src/agent/builtins/ios.toml` | XClaude fork authors |
| BASE_SAFETY_LAYER | `codex-rs/core/src/client_common.rs` (system prompt) | **Upstream only — DO NOT TOUCH** |
| BASE_TOOLING_LAYER | `codex-rs/core/src/client_common.rs` (tool instructions) | **Upstream only — DO NOT TOUCH** |

---

## How to Add a New Domain Profile

Adding a profile (e.g. `backend`, `web`) takes four steps:

### 1. Create the identity markdown

```
codex-rs/core/src/agent/builtins/<domain>_identity.md
```

Write the specialist identity. Mirror the structure of `ios_identity.md`:
- Primary domain expertise
- Architectural defaults
- Code standards
- Automatic behaviors
- Hard prohibitions

### 2. Create the role TOML

```
codex-rs/core/src/agent/builtins/<domain>.toml
```

```toml
# <Domain> role — DOMAIN_IDENTITY_LAYER
developer_instructions = """
<paste content from <domain>_identity.md>
"""
```

### 3. Register in `role.rs`

In `codex-rs/core/src/agent/role.rs`, make two changes:

**a) Add to the `configs()` `BTreeMap`:**

```rust
(
    "<domain>".to_string(),
    AgentRoleConfig {
        description: Some(r#"<one-liner description for spawn-agent tool>"#.to_string()),
        config_file: Some("<domain>.toml".to_string().parse().unwrap_or_default()),
    }
),
```

**b) Add to `config_file_contents()` match:**

```rust
const DOMAIN: &str = include_str!("builtins/<domain>.toml");
// ...
"<domain>.toml" => Some(DOMAIN),
```

### 4. Add a profile entry in `.codex/config.toml`

```toml
[profiles.<domain>]
role = "<domain>"
```

---

## Switching Profiles via CLI

```bash
# iOS mode (default for this fork)
codex "add a login screen"

# Override to generic Codex
codex --profile default "hello"

# Explicit iOS
codex --profile ios "create a SwiftUI list view"
```

---

## Upstream Merge Strategy

This fork is designed to stay merge-friendly with upstream Codex.

| File | Conflict risk | Notes |
|------|--------------|-------|
| `codex-rs/core/src/agent/builtins/ios*.toml` | None | Additive new files |
| `codex-rs/core/src/agent/builtins/ios_identity.md` | None | Additive new file |
| `.codex/config.toml` | None | In `.gitignore` upstream |
| `codex-rs/core/src/agent/role.rs` | Low | One `BTreeMap` entry + one match arm |
| `codex-rs/core/src/client_common.rs` | **None** | Untouched |
| `docs/XCLAUDE_ARCHITECTURE.md` | None | New file |

**Rebase workflow:**

```bash
git fetch upstream
git rebase upstream/main

# If role.rs conflicts: keep both the upstream changes AND our ios entry.
# The ios entry is a BTreeMap insert — it never overlaps with upstream changes.
```
