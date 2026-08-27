import { supabase } from "@/lib/supabase";

// US-only for now - mv_signal_scores only covers disclosure_type =
// 'transaction' (see docs/roadmaps/mvp.md, 3RNK.9/3RNK.5). UK/EU get their
// own unranked surfaces elsewhere rather than a shared score column, so the
// heading states scope explicitly instead of implying broader coverage.
export default async function TopFiveLeaderboard() {
	const { data, error } = await supabase
		.from("mv_signal_scores")
		.select(
			"disclosure_event_id, instrument_type, size_percentile, signal_score, cross_jurisdiction_flag, officials(full_name), securities(canonical_name, primary_ticker)",
		)
		.order("signal_score", { ascending: false })
		.limit(5);

	if (error) {
		return <p className="font-body text-ink">Failed to load leaderboard.</p>;
	}

	return (
		<section>
			<h2 className="font-display font-semibold tracking-tight text-2xl mb-4 text-ink">
				Top 5 — US Congress
			</h2>
			<table className="w-full font-mono text-sm">
				<thead>
					<tr className="text-left border-b border-brass">
						<th className="font-sans font-normal pr-4 py-2">Member</th>
						<th className="font-sans font-normal pr-4 py-2">Security</th>
						<th className="font-sans font-normal pr-4 py-2">Instrument</th>
						<th className="font-sans font-normal pr-4 py-2 text-right">Size</th>
						<th className="font-sans font-normal pr-4 py-2 text-right">Score</th>
					</tr>
				</thead>
				<tbody>
					{data.map((row) => (
						<tr key={row.disclosure_event_id} className="border-b border-brass/40">
							<td className="pr-4 py-2">{row.officials?.full_name ?? "—"}</td>
							<td className="pr-4 py-2">
								{row.securities?.canonical_name ?? "—"}
								{row.securities?.primary_ticker ? ` (${row.securities.primary_ticker})` : ""}
								{row.cross_jurisdiction_flag ? (
									<span
										className="ml-2 text-xs text-bench"
										title="Also disclosed in another jurisdiction"
									>
										⚑
									</span>
								) : null}
							</td>
							<td className="pr-4 py-2">{row.instrument_type ?? "—"}</td>
							<td className="pr-4 py-2 text-right">
								{row.size_percentile != null ? `${Math.round(row.size_percentile * 100)}th pct` : "—"}
							</td>
							<td className="pr-4 py-2 text-right">{row.signal_score?.toFixed(2) ?? "—"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}