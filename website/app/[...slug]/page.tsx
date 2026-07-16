import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicPages } from "../page-content";
import { SiteShell } from "../site-shell";
import { siteConfig } from "../site-config";

type RouteProps = { params: Promise<{ slug: string[] }> };

function resolvePage(slug: string[]) {
  if (slug[0] === "workflows" && slug.length === 2) return publicPages.workflows;
  if (slug[0] === "updates" && slug.length === 2) return publicPages.updates;
  if (slug.length !== 1) return undefined;
  return publicPages[slug[0]];
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = resolvePage(slug);
  if (!page) return {};
  return { title: page.title, description: page.summary };
}

export default async function PublicPageRoute({ params }: RouteProps) {
  const { slug } = await params;
  const page = resolvePage(slug);
  if (!page) notFound();

  const isWorkflow = slug[0] === "workflows" && slug.length === 2;
  const isUpdate = slug[0] === "updates" && slug.length === 2;

  return (
    <SiteShell>
      <main id="main-content" className="page-main">
        <section className="page-hero section-wrap">
          <p className="eyebrow">{page.eyebrow}</p>
          <h1>{isWorkflow ? "Workflow preview" : isUpdate ? "Update preview" : page.title}</h1>
          <p className="page-summary">{page.summary}</p>
          <div className="status-panel"><span>Status</span><p>{page.status}</p></div>
        </section>
        <section className="section-wrap page-sections">
          {isWorkflow && <article><p className="section-index">Catalogue entry</p><h2>{slug[1].replaceAll("-", " ")}</h2><p>No public Ontario workflow with this slug is approved yet. Future entries will include jurisdiction, practice area, version, contributor, review date, sources, limitations, and a launch-in-app action.</p></article>}
          {isUpdate && <article><p className="section-index">Update entry</p><h2>{slug[1].replaceAll("-", " ")}</h2><p>No published update exists at this placeholder route. Material updates will be versioned and dated.</p></article>}
          {!isWorkflow && !isUpdate && page.sections.map((section, index) => <article key={section.title}><p className="section-index">{String(index + 1).padStart(2, "0")}</p><h2>{section.title}</h2><p>{section.body}</p></article>)}
        </section>
        <section className="section-wrap review-panel">
          <div><p className="eyebrow">Content governance</p><h2>Review status is part of the content.</h2></div>
          <p>{page.review}</p>
        </section>
        <section className="page-cta"><div className="section-wrap"><div><p className="eyebrow">Inspect the work</p><h2>Follow ROSS in the open.</h2></div><div className="hero-actions"><a className="button light-button" href={siteConfig.sourceUrl}>View source</a><a className="button outline-button" href="/">Back home</a></div></div></section>
      </main>
    </SiteShell>
  );
}
