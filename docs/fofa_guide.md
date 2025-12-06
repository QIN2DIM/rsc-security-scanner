# FOFA Guide: Precision Search for AT-CF CVE Sites

In this guide, you will learn how to use FOFA to precisely locate sites vulnerable to AT-CF CVEs. We will focus specifically on filtering out sites protected by WAFs (Web Application Firewalls) like Cloudflare to improve the success rate of your testing.

## 🚀 Quick Start

If you want to get started immediately, here are the ready-to-use queries.

### Exclude Cloudflare and Major CDNs
Use this query to find exploitable sites while filtering out common protections:

```fofa
body="__next_f" && header="x-powered-by: Next.js" && header!="cloudflare" && header!="cf-ray" && header!="akamai" && header!="cloudfront" && header!="fastly" && header!="sucuri" && header!="ddos-guard" && header!="incapsula"
```

### Filter by Region (e.g., China ONLY)
To further narrow down results to a specific region (e.g., Mainland China), append the country code:

```fofa
body="__next_f" && header="x-powered-by: Next.js" && header!="cloudflare" && header!="cf-ray" && header!="akamai" && header!="cloudfront" && header!="fastly" && header!="sucuri" && header!="ddos-guard" && header!="incapsula" && country="CN"
```

---

## 📘 Deep Dive

Understanding *why* we use these queries will help you adapt them to different scenarios.

### 1. Identifying Cloudflare Characteristics
Cloudflare-protected sites often leave specific fingerprints in their HTTP headers. Recognizing these helps us filter them out.

| Feature Type | Identifier |
| :--- | :--- |
| **Server Header** | `server: cloudflare` |
| **CF-Ray Header** | `cf-ray: xxxxxx` |
| **Cache Header** | `cf-cache-status` |
| **Cookies** | `__cfruid`, `__cf_bm` |

### 2. Syntax for Exclusion
The core of our strategy is using the `!=` operator to exclude specific headers.

**Basic Exclusion:**
```fofa
header!="cloudflare" && header!="cf-ray"
```

### 3. Complete Search Queries
We combine the vulnerability signature (RSC fingerprints) with our exclusion logic.

**Standard Query:**
Matches Next.js RSC sites not on Cloudflare.
```fofa
body="__next_f" && header="x-powered-by: Next.js" && header!="cloudflare" && header!="cf-ray"
```

**Strict Version:**
Matches specific webpack signatures and excludes caching headers for higher precision.
```fofa
body="react-server-dom-webpack" && header!="cloudflare" && header!="cf-ray" && header!="cf-cache-status"
```

### 4. Excluding Multiple CDNs/WAFs
Real-world environments often use various protections. This query excludes a broad range of providers simultaneously:

```fofa
body="__next_f" && header="x-powered-by: Next.js" && header!="cloudflare" && header!="cf-ray" && header!="akamai" && header!="cloudfront" && header!="sucuri" && header!="ddos-guard"
```

---

## 🛠️ Practical Templates

Here are some common templates you can copy and adapt.

### RSC Target + WAF Exclusion
This covers the most common RSC entry points (`self.__next_f` or `window.__next_f`) and excludes major WAFs.
```fofa
(body="self.__next_f" || body="window.__next_f") && header!="cloudflare" && header!="cf-ray" && header!="akamai" && server!="cloudflare"
```

### Region Filtering
Filtering by region can be useful for targeting specific compliance zones or avoiding high-security regions.

**Focus on a Specific Country (e.g., CN):**
```fofa
body="__next_f" && header!="cloudflare" && country="CN"
```

**Exclude High-Security Regions (e.g., US):**
```fofa
body="__next_f" && header!="cloudflare" && country!="US"
```

---

## 📚 Reference: Common WAF/CDN Exclusion List

Use this table to construct your own custom filters.

| Provider | FOFA Exclusion Syntax |
| :--- | :--- |
| **Cloudflare** | `header!="cloudflare" && header!="cf-ray"` |
| **Akamai** | `header!="akamai"` |
| **AWS CloudFront** | `header!="cloudfront" && header!="x-amz"` |
| **Fastly** | `header!="fastly"` |
| **Sucuri** | `header!="sucuri"` |
| **DDoS-Guard** | `header!="ddos-guard"` |
| **Imperva/Incapsula** | `header!="incapsula" && header!="imperva"` |
