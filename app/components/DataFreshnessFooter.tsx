import { supabaseAdmin } from "@/lib/supabase";

// ingestion_runs has RLS enabled with zero policies (see 1SCH.6) - the public
// client can't read it, so this uses the admin client. Safe here since this
// runs server-side only and the secret key never reaches the client bundle.
export default async function DataFreshnessFooter() {
	const { data, error } = await supabaseAdmin
		.from("ingestion_runs")
		.select("finished_at")
		.in("status", ["success", "partial"])
		.order("finished_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	const label =
		error || !data?.finished_at
			? "Data freshness unavailable"
			: `Data last updated ${new Intl.DateTimeFormat("en-GB", {
					dateStyle: "medium",
					timeStyle: "short",
				}).format(new Date(data.finished_at))}`;

	return (
		<footer className="border-t border-brass/40 px-8 py-4 text-xs font-mono text-ink/60">
			{label}
		</footer>
	);
}