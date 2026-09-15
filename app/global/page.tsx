import Link from "next/link";
import { supabase } from "@/lib/supabase";
import JurisdictionTag from "@/app/components/JurisdictionTag";

// UK/EU disclosures are threshold-crossing and periodic filings, not
// continuous transaction records - framed as "position changes," not
// "trades" (see docs/political-disclosure-tracker-mvp-design.md §8).
// AU has no in-scope adapter yet (1ADP.3), so this is UK + EU only for now.
export default async function GlobalPage({
	searchParams,
}: {
	searchParams: Promise<{ jurisdiction?: string }>;
}) {
	const { jurisdiction } = await searchParams;
	const countries = jurisdiction === "uk" ? ["UK"] : jurisdiction === "eu" ? ["EU"] : ["UK", "EU"];

	const { data: disclosures, error } = await supabase
		.from("disclosure_events")
		.select("id, country, notification_date, raw_security_text, value_band, amount_min, currency, officials(full_name)")
		.in("country", countries)
		.order("notification_date", { ascending: false, nullsFirst: false });

	if (error) {
		return <main className="p-8">Failed to load disclosures.</main>;
	}

	return (
		<main className="p-8">
			<h1 className="font-display font-semibold tracking-tight text-2xl mb-2 text-ink">
				Notable Position Changes — UK &amp; EU
			</h1>
			<p className="font-body text-sm text-ink/70 mb-4">
				Threshold-crossing and periodic disclosures, not individual trades. See{" "}
				<Link href="/about" className="underline">
					About
				</Link>{" "}
				for how these differ from the US feed.
			</p>

			<nav className="mb-4 flex gap-4 font-sans text-sm">
				<Link href="/global" className={!jurisdiction ? "font-bold underline" : "underline"}>
					All
				</Link>
				<Link href="/global?jurisdiction=uk" className={jurisdiction === "uk" ? "font-bold underline" : "underline"}>
					UK
				</Link>
				<Link href="/global?jurisdiction=eu" className={jurisdiction === "eu" ? "font-bold underline" : "underline"}>
					EU
				</Link>
			</nav>

			{disclosures.length === 0 ? (
				<p className="font-body text-ink">No position changes recorded for this jurisdiction yet.</p>
			) : (
				<table className="w-full font-mono text-sm">
					<thead>
						<tr className="text-left border-b border-brass">
							<th className="font-sans font-normal pr-4 py-2">Official</th>
							<th className="font-sans font-normal pr-4 py-2">Security</th>
							<th className="font-sans font-normal pr-4 py-2">Jurisdiction</th>
							<th className="font-sans font-normal pr-4 py-2">Position</th>
							<th className="font-sans font-normal pr-4 py-2 text-right">Notified</th>
						</tr>
					</thead>
					<tbody>
						{disclosures.map((d) => (
							<tr key={d.id} className="border-b border-brass/40">
								<td className="pr-4 py-2">{d.officials?.full_name ?? "—"}</td>
								<td className="pr-4 py-2">{d.raw_security_text ?? "—"}</td>
								<td className="pr-4 py-2">
									<JurisdictionTag country={d.country} />
								</td>
								<td className="pr-4 py-2">
									{d.currency && d.amount_min != null
										? `${d.currency} ${d.amount_min.toLocaleString()}`
										: (d.value_band ?? "—")}
								</td>
								<td className="pr-4 py-2 text-right">{d.notification_date ?? "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</main>
	);
}
