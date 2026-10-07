# Account Lens

A working, dependency-free first version of an evidence-led prospecting app. Requires Node.js 22+ and curl.

## Run

```sh
npm start
```

Serves on port 3000 (`PORT` overrides it). `npm run dev` enables restart on edits. `npm test` runs the research-engine tests.

Enter a company name or ticker and enable online research to retrieve the latest SEC 10-K and 10-Q and a public Wikipedia overview. Import investor-day materials, earnings transcripts and company pages by HTTPS URL or pasted text. Paste text for PDFs. Imports can also be used with online research disabled. Results include source passages, links, dates, AI hypotheses, outcomes, discovery questions, and research gaps. Export JSON or print the complete brief.

## Research boundaries

This version uses topic matching and explicit hypothesis templates, not an LLM. It does not verify statements, resolve named executives into a current organization chart, or automatically discover investor-day decks and earnings transcripts. All extracted statements are labeled source passages; imported text is explicitly unverified. Wikipedia search matches require company-identity review. Source failures remain visible, and missing evidence never generates a supported claim. There are no invented ROI numbers or buying signals.

Long filings are reviewed up to 1 million plain-text characters; other materials up to 220,000. Coverage and truncation are shown. Dates are provided by SEC metadata or the user, never inferred from retrieval dates. Research is ephemeral: no database or history, and no authentication. Use within a trusted development environment; add authentication, request limits and durable storage before exposing publicly.

## Network

Needs HTTPS access to `www.sec.gov`, `data.sec.gov`, `en.wikipedia.org`, and any imported source host. `dns.google` provides public IPv4 resolution when direct DNS is unavailable in the cloud environment. Set `SEC_USER_AGENT` to an appropriate descriptive agent with your contact email for SEC access. SEC may rate-limit or block automated clients even with internet access. The app uses curl so environment HTTPS proxy settings are respected; TLS validation remains enabled. Only public HTTPS sources on the standard port are accepted, private addresses are rejected, redirects are not followed, and download size and time are bounded. PDF extraction is not supported; paste its text instead.

## Useful verification

Use a real company and inspect source links. For a fully offline functional check, disable online research and paste a dated passage that includes leadership, priorities, technology and initiatives; confirm exact quotations, citation navigation, hypothesis references, and missing-source disclosures. Tests use synthetic Acme passages only and are not account research.
