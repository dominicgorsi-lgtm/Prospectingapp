# Account Lens

Evidence-led account research, investor-material discovery, editable organization maps, and batch processing. Requires Node.js 22+ and curl.

## Run and deploy

```sh
npm ci
npm test
npm start
```

Serves on port 3000 or the injected `PORT`. On Render, use the Node runtime, build command `npm ci`, start command `npm start`, and health check `/health`. `npm run dev` watches server changes. The PDF extractor is installed through npm; no external PDF program is required.

## Research

Enter a company name or ticker. The app resolves the SEC issuer, discovers its official website (known company seeds or Wikidata), starts from the investor center, and follows public HTML links and supported public Q4 financial feeds to archive pages, presentations, investor days, earnings transcripts and reports. Supply official website, investor-relations, and leadership URLs in **Research scope & official pages** when discovery is missing or ambiguous.

Choose a 12-month to 10-year window and a 12–80 document budget. SEC discovery includes annual/quarterly reports and amendments within that window, with up to three relevant older submission archives. Investor-center navigation is bounded to eight pages by default, document downloads are prioritized by known dates, and each account has a four-minute time budget. The document inventory lists reviewed, failed, out-of-window and budget-limited links. This is **not an exhaustive download of every historical document**. JavaScript-only listings, authenticated sites, anti-bot restrictions and scanned PDFs may require direct URLs or pasted material. Text PDFs are extracted automatically, up to 400 pages; long text is limited to one million characters and truncation is disclosed.

Publication dates come from SEC filing metadata, explicit link dates or page metadata. Retrieval dates are separate. Unknown dates are labeled unknown; annual-report financial periods are not invented publication dates. Undated company pages are included for relevance but are not evidence of freshness. Newer dated passages are prioritized. Report passages and AI use-case templates remain distinguishable: the app does not independently verify statements or use an LLM for synthesis.

## Organization maps

Accessible leadership pages and profiles seed named person cards with role passages and source links. Board members are distinguished from management when page headings identify them; their displayed titles may refer to outside organizations. Verify detected identities and roles before outreach. The app **never invents reporting lines**.

Drag cards to arrange the canvas. Select **Edit details** to add people, roles, project notes, managers and supporting URLs. Reporting lines are manually supplied and checked for cycles. Maps save in local browser storage per account; rerunning research preserves manual additions and positions while updating matching sourced people. Earlier retained people remain labeled for reverification. **Export map** and **Import map** transfer the map between devices. This is browser-local persistence, not a shared project database. Clearing browser storage removes the local map.

## Batch accounts

Upload CSV/TXT or paste one company/ticker per line. CSV headers: `company`, `ticker`, `website_url` (or `website`), `investor_url`, `leadership_url`. Tickers take precedence when both ticker and company are supplied. Quote names containing commas. Duplicate names/tickers are removed; up to 50 distinct accounts are supported.

Two accounts run concurrently in a server-wide queue. The UI polls for progress and opens each completed or partial report and organization map. Export results as JSON. Stop queued accounts without discarding work already in flight. Jobs are memory-only, expire after one hour, and are lost on a server restart; export completed results. Account research requests use asynchronous jobs to avoid holding a deployment proxy connection open.

## API

- `POST /api/batches`: `{ "accounts": [{"company":"AAPL","investorUrl":"https://investor.apple.com"}], "options": {"months":24,"maxDocuments":24,"live":true} }`; returns a job ID.
- `GET /api/batches/:id`: per-account status, results and errors.
- `DELETE /api/batches/:id`: stop queued accounts.
- `POST /api/brief`: synchronous research, retained for integrations and small/offline requests.
- `GET /health`: health status.

Requests are limited to 3 MB and research submissions to 12 per ten minutes per client address. The server retains up to 20 jobs, with two active accounts globally. Public deployment currently has no account authentication. Use appropriate authentication and durable job/project storage before relying on it as a shared production workspace.

## Network and validation

Needs HTTPS to SEC, official company sites and their linked document hosts, Wikipedia/Wikidata for website discovery, and `dns.google` when direct DNS is unavailable. Optional `SEC_USER_AGENT` should identify the application and provide a contact email for SEC requests. Each HTTPS redirect is validated, private/local targets are rejected, public IPv4 addresses are pinned for direct curl requests, TLS verification stays enabled, and response size/time are bounded. Environment HTTPS proxy settings remain supported.

`npm test` exercises evidence citations, source dates, filing-window selection, archive navigation, PDF-result handling, leadership extraction, unknown reporting lines, graph cycle validation, CSV parsing, queue concurrency, cancellation and partial failures. Live source access varies by hosting provider and should be checked separately from deterministic tests.
