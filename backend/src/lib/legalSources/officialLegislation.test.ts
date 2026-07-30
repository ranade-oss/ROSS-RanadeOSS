import assert from "node:assert/strict";
import test from "node:test";
import type { A2ajClient } from "./a2ajClient";
import {
    JusticeLawsProvider,
    normalizeLegislationDate,
    OntarioELawsProvider,
} from "./officialLegislation";

const syntheticFederalXml = `<?xml version="1.0" encoding="utf-8"?>
<Statute xmlns:lims="http://justice.gc.ca/lims" lims:current-date="2026-07-10" lims:lastAmendedDate="2026-06-01" in-force="yes" xml:lang="en">
  <Identification><ShortTitle status="official">Synthetic Federal Act</ShortTitle></Identification>
  <Body>
    <Section lims:inforce-start-date="2025-01-01" lims:lastAmendedDate="2026-06-01">
      <MarginalNote>Synthetic duty</MarginalNote><Label>1</Label><Text>A synthetic person must use synthetic material.</Text>
    </Section>
    <Section lims:inforce-start-date="2025-01-01"><Label>2</Label><Text>This is a SYNTHETIC test provision.</Text></Section>
  </Body>
</Statute>`;

const syntheticOntarioHtml = `<!doctype html><html><body>
<p>Current up-to-date to July 10, 2026.</p>
<div>1 (1) A synthetic person must use synthetic material.</div>
<div>2 This is a SYNTHETIC test provision.</div>
</body></html>`;

const syntheticOntarioDocument = JSON.stringify({
    content: syntheticOntarioHtml,
    state: "current",
    dateFrom: "2026-07-01T04:00:00.000Z",
});

const unavailableDiscovery = {
    search: async () => {
        throw new Error("Synthetic discovery outage");
    },
} as unknown as A2ajClient;

test("legislation calendar dates do not shift with the host timezone", () => {
    assert.equal(normalizeLegislationDate("July 10, 2026"), "2026-07-10");
    assert.equal(normalizeLegislationDate("10 July 2026"), "2026-07-10");
    assert.equal(
        normalizeLegislationDate("2026-07-10T23:30:00-04:00"),
        "2026-07-10",
    );
    assert.equal(normalizeLegislationDate("February 30, 2026"), null);
    assert.equal(normalizeLegislationDate("not a date"), null);
});

test("Justice Laws provider parses official XML metadata and a requested section", async () => {
    const urls: string[] = [];
    const provider = new JusticeLawsProvider(async (input) => {
        urls.push(String(input));
        return new Response(syntheticFederalXml, {
            status: 200,
            headers: { "content-type": "application/xml" },
        });
    });
    const document = await provider.fetchLegislation("federal-act-d-3.4", {
        section: "1",
    });
    assert.match(
        urls[0],
        /justicecanada\/laws-lois-xml\/main\/eng\/acts\/D-3\.4\.xml$/,
    );
    assert.equal(document.currentToDate, "2026-07-10");
    assert.equal(document.lastAmendedDate, "2026-06-01");
    assert.equal(document.sections.length, 1);
    assert.equal(document.sections[0].label, "1");
    assert.match(document.sections[0].text, /synthetic material/);
    assert.match(document.sections[0].sourceUrl, /section-1\.html$/);
    assert.equal(document.verification, "verified");
    assert.equal(document.reproductionIsOfficial, false);
    assert.match(document.sourceHash ?? "", /^[a-f0-9]{64}$/);
});

test("Ontario e-Laws provider uses allowlisted official pages and extracts currency", async () => {
    const urls: string[] = [];
    const provider = new OntarioELawsProvider(async (input) => {
        const url = String(input);
        urls.push(url);
        return new Response(
            url.endsWith("/currency-date")
                ? "July 10, 2026"
                : syntheticOntarioDocument,
            {
                status: 200,
                headers: {
                    "content-type": url.endsWith("/currency-date")
                        ? "text/plain"
                        : "application/json",
                },
            },
        );
    }, unavailableDiscovery);
    const results = await provider.searchLegislation({
        query: "small claims rules",
    });
    assert.equal(results[0].sourceId, "ontario-regulation-980258");
    const document = await provider.fetchLegislation(
        "ontario-regulation-980258",
        { section: "1(1)" },
    );
    assert.ok(
        urls.includes(
            "https://www.ontario.ca/laws/api/v2/legislation/en/doc-search/regulation/980258",
        ),
    );
    assert.ok(
        urls.includes(
            "https://www.ontario.ca/laws/api/v2/legislation/en/currency-date",
        ),
    );
    assert.equal(document.currentToDate, "2026-07-10");
    assert.equal(document.sections.length, 1);
    assert.equal(document.sections[0].label, "1(1)");
    assert.equal(document.reproductionIsOfficial, false);
});

test("Ontario e-Laws discovers arbitrary instruments and retrieves official text", async () => {
    const discovery = {
        search: async () => ({
            results: [
                {
                    dataset: "LEGISLATION-ON",
                    name_en: "Privacy Act",
                    citation_en: "R.S.O. 1990, c. P.21",
                    source_url_en: "https://www.ontario.ca/laws/statute/90p21",
                },
            ],
        }),
    } as unknown as A2ajClient;
    const provider = new OntarioELawsProvider(
        async (input) =>
            new Response(
                String(input).endsWith("/currency-date")
                    ? "July 10, 2026"
                    : syntheticOntarioDocument,
                { status: 200 },
            ),
        discovery,
    );
    const results = await provider.searchLegislation({
        query: "Privacy Act",
        kind: "legislation",
    });
    assert.equal(results[0].sourceId, "ontario-statute-90p21");
    assert.equal(
        results[0].canonicalUrl,
        "https://www.ontario.ca/laws/statute/90p21",
    );
    const document = await provider.fetchLegislation(results[0].sourceId);
    assert.match(document.fullText ?? "", /synthetic material/);
});

test("Justice Laws discovers arbitrary instruments from its official catalogue", async () => {
    const lookup = `<?xml version="1.0"?>
<Database><Statutes><Statute>
<ChapterNumber>P-21</ChapterNumber><OfficialNumber>R.S.C. 1985, c. P-21</OfficialNumber>
<Language>en</Language><ShortTitle>Privacy Act</ShortTitle><ConsolidateFlag>True</ConsolidateFlag>
</Statute></Statutes><Regulations /></Database>`;
    const urls: string[] = [];
    const provider = new JusticeLawsProvider(async (input) => {
        const url = String(input);
        urls.push(url);
        return new Response(
            url.endsWith("/lookup/lookup.xml") ? lookup : syntheticFederalXml,
            { status: 200 },
        );
    });
    const results = await provider.searchLegislation({ query: "Privacy Act" });
    assert.equal(results[0].sourceId, "federal-act-p-21");
    assert.equal(results[0].citation, "R.S.C. 1985, c. P-21");
    await provider.fetchLegislation(results[0].sourceId);
    assert.ok(urls.some((url) => url.endsWith("/eng/acts/P-21.xml")));
});

test("official providers fail closed for inferred historical versions", async () => {
    const provider = new JusticeLawsProvider(async () =>
        Response.json({}, { status: 200 }),
    );
    await assert.rejects(
        () =>
            provider.fetchLegislation("federal-act-d-3.4", {
                versionDate: "2020-01-01",
            }),
        /historical-version retrieval/,
    );
});

test("official provider health exercises the production retrieval path", async () => {
    let ontarioRequests = 0;
    const ontario = new OntarioELawsProvider(async (input) => {
        ontarioRequests += 1;
        const url = String(input);
        return new Response(
            url.endsWith("/currency-date")
                ? "July 10, 2026"
                : syntheticOntarioDocument,
            { status: 200 },
        );
    }, unavailableDiscovery);
    const justice = new JusticeLawsProvider(
        async () => new Response(syntheticFederalXml, { status: 200 }),
    );

    assert.equal((await ontario.health()).ok, true);
    assert.equal(ontarioRequests, 2);
    assert.equal((await justice.health()).ok, true);

    const failed = new OntarioELawsProvider(
        async () => new Response("unavailable", { status: 503 }),
        unavailableDiscovery,
    );
    assert.equal((await failed.health()).ok, false);
});
