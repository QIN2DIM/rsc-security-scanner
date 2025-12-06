# rsc-security-scanner

A browser extension for detecting **React Server Components (RSC)** and **Next.js App Router** fingerprints.

## Features

- **Passive Scan** - Automatically detect RSC/Next.js indicators in page content
- **Active Fingerprint** - Probe server responses with `RSC: 1` header
- **WAF Detection** - Identify common WAFs (Cloudflare, AWS, Akamai, etc.)
- **RCE Exploit** - Test CVE vulnerabilities in Next.js Server Actions

## Installation

1. Clone the repository
2. Load `src/` as an unpacked extension in Chrome/Edge
3. For Firefox, use `manifest.firefox.json`

## Gallery

| SCANNER                                           | EXPLOIT                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ |
| ![](./docs/assets/PixPin_2025-12-06_10-37-32.png) | <img src="./docs/assets/PixPin_2025-12-06_10-48-00.png" style="zoom:98%;" /> |



