export default function AboutPage() {
	return (
		<main className="p-8 max-w-2xl mx-auto">
			<h1 className="font-display font-semibold tracking-tight text-3xl mb-6 text-ink">
				About CrossBench
			</h1>

			<article className="font-body text-ink space-y-6 leading-relaxed">
				<section>
					<h2 className="font-display font-semibold text-xl mb-2">What this is</h2>
					<p>
						CrossBench tracks financial disclosures made by elected and appointed officials —
						currently US Congress (House and Senate), UK Parliament, and the European
						Commission. It surfaces disclosures that are unusually large, unusually clustered,
						or held by officials with a plausible conflict of interest, based on their
						committee or portfolio assignments.
					</p>
				</section>

				<section>
					<h2 className="font-display font-semibold text-xl mb-2">What the score means</h2>
					<p>
						The <strong>signal score</strong> shown on the homepage is a notability measure, not
						a return prediction. It combines four factors: the size of the disclosed position
						relative to other disclosures, the disclosing official&apos;s committee or portfolio
						relevance to the security&apos;s sector, how many other officials disclosed the same
						security in the past 90 days, and whether the security also appears in another
						jurisdiction&apos;s disclosures. Options receive a higher weighting than equities,
						reflecting the leverage involved.
					</p>
					<p>
						<strong>This is not investment advice.</strong> A high score means a disclosure is
						worth attention, not that the underlying trade will perform well. CrossBench does
						not simulate returns, recommend positions, or endorse any official&apos;s trading
						activity.
					</p>
				</section>

				<section>
					<h2 className="font-display font-semibold text-xl mb-2">Coverage differs by jurisdiction</h2>
					<p>
						The signal score currently covers US transaction disclosures only. UK and EU
						Commission disclosures are threshold-crossing or periodic filings rather than
						continuous transaction records, and don&apos;t carry a comparable score yet — showing
						one would either fabricate a number or make officials who simply aren&apos;t measured
						on this axis look artificially low-signal. Those disclosures are shown as their own
						feed instead.
					</p>
				</section>

				<section>
					<h2 className="font-display font-semibold text-xl mb-2">Data</h2>
					<p>
						All data comes from official public sources: the US House and Senate financial
						disclosure systems, the UK Parliament Register of Members&apos; Financial Interests,
						and the European Commission&apos;s published Declarations of Interest. Disclosures are
						fetched automatically once a day — see the freshness timestamp in the site footer
						for when data was last updated.
					</p>
				</section>
			</article>
		</main>
	);
}
