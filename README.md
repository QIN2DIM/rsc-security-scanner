# rsc-security-scanner

A browser extension for detecting **React Server Components (RSC)** and **Next.js App Router** fingerprints.

| SCANNER                                           | EXPLOIT                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ |
| ![](./docs/assets/PixPin_2025-12-06_10-37-32.png) | <img src="./docs/assets/PixPin_2025-12-06_10-48-00.png" style="zoom:98%;" /> |

## Features

- **Passive Scan** - Automatically detect RSC/Next.js indicators in page content
- **Active Fingerprint** - Probe server responses with `RSC: 1` header
- **WAF Detection** - Identify common WAFs (Cloudflare, AWS, Akamai, etc.)
- **RCE Exploit** - Test CVE vulnerabilities in Next.js Server Actions

## Installation

### From Source (Development)

```bash
# Clone and install dependencies
git clone https://github.com/QIN2DIM/rsc-security-scanner.git
cd rsc-security-scanner
pnpm install

# Build development version
pnpm run build:dev
```

**Chrome/Edge:**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Drag `dist/dev/rsc-security-scanner.zip` into the page

**Firefox (temporary):**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `dist/dev/rsc-security-scanner.xpi`

### Signed Firefox Extension

For permanent Firefox installation, you need a signed `.xpi` file.

## Build Commands

| Command | Output | Description |
|---------|--------|-------------|
| `pnpm run build` | `dist/dev/` | Development build (unsigned) |
| `pnpm run build:dev` | `dist/dev/` | Same as above |
| `pnpm run build:release` | `dist/release/` | Release build with signed Firefox extension |

### Output Structure

```
dist/
├── dev/
│   ├── rsc-security-scanner.zip   # Chrome (drag to chrome://extensions/)
│   └── rsc-security-scanner.xpi   # Firefox (unsigned, temporary load only)
│
└── release/
    ├── rsc-security-scanner.zip   # Chrome
    └── rsc-security-scanner.xpi   # Firefox (signed ✓ permanent install)
```

## Firefox Signing Setup

Firefox requires extensions to be signed by Mozilla for permanent installation.

### 1. Get API Credentials

Visit [Mozilla AMO API Keys](https://addons.mozilla.org/developers/addon/api/key/) and generate your credentials.

### 2. Configure Credentials

```bash
# Copy the example env file
cp .env.example .env.local

# Edit .env.local with your credentials
WEB_EXT_API_KEY=user:xxxxx:xxx
WEB_EXT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Build Signed Release

```bash
pnpm run build:release
```

The signed `.xpi` will be in `dist/release/` and can be installed directly in Firefox.

> **Note:** Each release requires a unique version number. Update `version` in `src/manifest.firefox.json` before running `build:release` again.

## Development

```bash
# Run in Firefox Developer Edition (live reload)
pnpm run run:firefox

# Lint extension code
pnpm run lint
```

## License

GPL-3.0
