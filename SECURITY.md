# Security Policy

## Supported Versions

| Version | Supported   |
| ------- | ----------- |
| 0.7.x   | Yes         |
| 0.6.x   | Best effort |
| < 0.6.0 | No          |

## Current Security Posture

- Provider API keys are stored in VS Code `SecretStorage`.
- Figma design retrieval and profiler log parsing are local-first features in the shipped extension.
- The repository includes a Cloudflare Worker project for remote Figma experiments, but the extension's remote Figma workflow is currently disabled in the supported UI path.
- Generated previews execute inside VS Code webviews or a local browser-preview runtime, so preview-related reports should include the exact output format and reproduction payload when possible.

## Reporting a Vulnerability

Please report suspected vulnerabilities through a private GitHub security advisory or by emailing the maintainer listed in the marketplace publisher profile.

Include:

- A short description of the issue
- Reproduction steps or a proof of concept
- Expected impact
- Affected version or commit
- Suggested remediation if available

Target response times:

- Initial acknowledgement within 3 business days
- Triage follow-up after impact review

Please do not disclose the issue publicly until a fix or mitigation is available.
