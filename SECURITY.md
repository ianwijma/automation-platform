# Security Policy

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

Instead, report them via one of the following:

- **Email**: Send a detailed report to the maintainer
- **GitHub Security Advisory**: Use the [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) feature

Please include:

- The type of vulnerability (e.g., RCE, credential leak, privilege escalation)
- The affected component and version
- Step-by-step reproduction instructions
- Potential impact
- Any mitigating factors

You can expect a response within 48 hours. If the vulnerability is confirmed, we will:

1. Acknowledge the report
2. Work on a fix
3. Release a patch version
4. Credit you in the release notes (unless you prefer to remain anonymous)

## Security Architecture

### Credential Storage

- Credentials are encrypted with AES-256-GCM envelope encryption
- The instance key is stored in the SQLite `settings` table
- An optional `AP_MASTER_KEY` passphrase can wrap the instance key
- Join tokens are stored hashed (SHA-256) — the plaintext token is only shown once at creation

### Secret Delivery

- Secrets are delivered JIT (just-in-time) to agents at execution time
- Secrets are never included in exports, version history, or API list responses
- The `savePayloads: false` setting prevents I/O data (including resolved secrets) from being stored in execution records

### Agent Protocol

- WSS connections authenticate via join tokens on the `hello` frame
- Heartbeat tracking disconnects unresponsive agents after 2 missed beats
- Remote agent dispatch enforces per-node timeouts

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x | Pre-release — active development |
| 1.x+ | Will receive security patches |

## Known Considerations

- The single-binary design means all dependencies are bundled — keep them updated
- The local agent executes commands on the host machine — only run automations you trust
- The AI panel sends automation context to external LLM providers — do not include secrets in node params
