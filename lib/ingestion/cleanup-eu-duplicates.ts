import { supabaseAdmin } from "../supabase";

// One-off cleanup for the date-keyed sourceRef bug (fixed in adapters/eu.ts) -
// run once, after the hash-based fix has landed and at least one fresh
// ingestion cycle has run, to collapse the daily duplicate rows it produced.
// Keeps the row with the latest fetched_at per commissioner slug, deletes the
// rest and their linked disclosure_events (no cascade on that FK).
async function main() {
	const { data: raw, error } = await supabaseAdmin
		.from("raw_documents")
		.select("id, source_ref, fetched_at")
		.eq("source_name", "eu_commission_doi")
		.order("fetched_at", { ascending: true });
	if (error) throw error;

	const bySlug = new Map<string, typeof raw>();
	for (const row of raw) {
		const slug = row.source_ref.split("_").slice(0, -1).join("_");
		const list = bySlug.get(slug) ?? [];
		list.push(row);
		bySlug.set(slug, list);
	}

	const idsToDelete = [...bySlug.values()].flatMap((rows) => rows.slice(0, -1).map((r) => r.id));
	console.log(`Found ${raw.length} EU raw_documents rows across ${bySlug.size} commissioners.`);
	console.log(`Deleting ${idsToDelete.length} duplicate rows (keeping latest per commissioner) and their disclosure_events.`);

	if (idsToDelete.length === 0) {
		console.log("Nothing to clean up.");
		return;
	}

	const { error: discError } = await supabaseAdmin
		.from("disclosure_events")
		.delete()
		.in("source_document_id", idsToDelete);
	if (discError) throw discError;

	const { error: rawError } = await supabaseAdmin.from("raw_documents").delete().in("id", idsToDelete);
	if (rawError) throw rawError;

	console.log("Done.");
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});