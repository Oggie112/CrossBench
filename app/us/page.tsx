import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default async function UsPage({
	searchParams,
}: {
	searchParams: Promise<{ type?: string }>;
}) {
	const { type } = await searchParams;

	let query = supabase
		.from("disclosure_events")
		.select("id, notification_date, raw_security_text, transaction_type, instrument_type, amount_min, amount_max")
		.eq("country", "US")
		.order("notification_date", { ascending: false });

	if (type === "equity") {
		query = query.eq("instrument_type", "equity");
	} else if (type === "options") {
		query = query.in("instrument_type", ["option_call", "option_put"]);
	}

	const { data: disclosures, error } = await query;

	if (error) {
		return <main className="p-8">Failed to load disclosures.</main>;
	}

	return (
		<main className="p-8">
			<h1 className="text-xl font-semibold mb-4">US Disclosures</h1>

			<nav className="mb-4 flex gap-4">
				<Link href="/us" className={!type ? "font-bold underline" : "underline"}>All</Link>
				<Link href="/us?type=equity" className={type === "equity" ? "font-bold underline" : "underline"}>Equity</Link>
				<Link href="/us?type=options" className={type === "options" ? "font-bold underline" : "underline"}>Options</Link>
			</nav>

			{disclosures.length === 0 ? (
				<p>No US disclosures yet.</p>
			) : (
				<table className="border-collapse w-full text-sm">
					<thead>
						<tr className="text-left border-b">
							<th className="pr-4 py-1">Notified</th>
							<th className="pr-4 py-1">Security</th>
							<th className="pr-4 py-1">Type</th>
							<th className="pr-4 py-1">Instrument</th>
							<th className="pr-4 py-1">Amount</th>
						</tr>
					</thead>
					<tbody>
						{disclosures.map((d) => (
							<tr key={d.id} className="border-b">
								<td className="pr-4 py-1">{d.notification_date ?? "—"}</td>
								<td className="pr-4 py-1">{d.raw_security_text ?? "—"}</td>
								<td className="pr-4 py-1">{d.transaction_type ?? "—"}</td>
								<td className="pr-4 py-1">{d.instrument_type ?? "—"}</td>
								<td className="pr-4 py-1">
									{d.amount_min != null && d.amount_max != null
										? `$${d.amount_min.toLocaleString()} - $${d.amount_max.toLocaleString()}`
										: "—"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</main>
	);
}
