import Link from "next/link";

// Root app/not-found.tsx handles all unmatched URLs app-wide since Next.js
// 13.3 (confirmed against the vendored docs, not assumed) - no experimental
// flag needed. Renders inside the root layout, so SiteNav/DataFreshnessFooter
// show automatically.
export default function NotFound() {
	return (
		<main className="p-8 max-w-2xl mx-auto">
			<h1 className="font-display font-semibold tracking-tight text-3xl mb-4 text-ink">
				Not Found
			</h1>
			<p className="font-body text-ink mb-6">
				No page recorded at this address.
			</p>
			<Link href="/" className="font-sans text-sm underline text-ink">
				Return to the homepage
			</Link>
		</main>
	);
}
