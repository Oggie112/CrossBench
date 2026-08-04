import { supabaseAdmin } from "../supabase";
import type { SourceAdapter } from "../adapters/source-adapter";

export interface IngestionResult {
	sourceName: string;
	recordsFetched: number;
	recordsNew: number;
	status: "success" | "partial" | "failed";
	errorMessage?: string;
}

export async function runIngestion(adapter: SourceAdapter): Promise<IngestionResult> {
	const { data: run, error: runError } = await supabaseAdmin
		.from("ingestion_runs")
		.insert({ source_name: adapter.sourceName, started_at: new Date().toISOString(), status: "running" })
		.select("id")
		.single();

	if (runError || !run) {
		throw new Error(`Failed to create ingestion_runs row: ${runError?.message}`);
	}

	const finish = async (result: Omit<IngestionResult, "sourceName">): Promise<IngestionResult> => {
		await supabaseAdmin
			.from("ingestion_runs")
			.update({
				finished_at: new Date().toISOString(),
				records_fetched: result.recordsFetched,
				records_new: result.recordsNew,
				status: result.status,
				error_message: result.errorMessage ?? null,
			})
			.eq("id", run.id);

		return { sourceName: adapter.sourceName, ...result };
	};

	const { data: existing, error: existingError } = await supabaseAdmin
		.from("raw_documents")
		.select("source_ref")
		.eq("source_name", adapter.sourceName);

	if (existingError) {
		return finish({ recordsFetched: 0, recordsNew: 0, status: "failed", errorMessage: existingError.message });
	}

	const knownSourceRefs = new Set(existing.map((row) => row.source_ref));

	let fetched;
	try {
		fetched = await adapter.fetch(knownSourceRefs);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return finish({ recordsFetched: 0, recordsNew: 0, status: "failed", errorMessage: message });
	}

	// UK/EU adapters ignore knownSourceRefs and always return their full fetch
	// window, so dedup happens here regardless of whether the adapter honours it.
	const newDocuments = fetched.filter((doc) => !knownSourceRefs.has(doc.sourceRef));

	let recordsNew = 0;
	let hadErrors = false;

	for (const document of newDocuments) {
		const { data: rawRow, error: insertError } = await supabaseAdmin
			.from("raw_documents")
			.insert({
				country: document.country,
				source_name: document.sourceName,
				source_ref: document.sourceRef,
				processed: false,
			})
			.select("id")
			.single();

		if (insertError || !rawRow) {
			hadErrors = true;
			continue;
		}

		try {
			const disclosures = await adapter.parse(document);

			if (disclosures.length > 0) {
				const { error: disclosureError } = await supabaseAdmin.from("disclosure_events").insert(
					disclosures.map((d) => ({
						country: d.country,
						disclosure_type: d.disclosureType,
						transaction_type: d.transactionType ?? null,
						instrument_type: d.instrumentType ?? "equity",
						raw_security_text: d.rawSecurityText,
						transaction_date: d.transactionDate ?? null,
						notification_date: d.notificationDate ?? null,
						amount_min: d.amountMin ?? null,
						amount_max: d.amountMax ?? null,
						currency: d.currency ?? null,
						value_band: d.valueBand ?? null,
						as_of_date: d.asOfDate ?? null,
						source_document_id: rawRow.id,
						confidence: d.confidence ?? "high",
					})),
				);

				if (disclosureError) throw new Error(disclosureError.message);
			}

			await supabaseAdmin.from("raw_documents").update({ processed: true }).eq("id", rawRow.id);
			recordsNew++;
		} catch (err) {
			hadErrors = true;
			const message = err instanceof Error ? err.message : String(err);
			await supabaseAdmin.from("raw_documents").update({ processing_error: message }).eq("id", rawRow.id);
		}
	}

	return finish({
		recordsFetched: fetched.length,
		recordsNew,
		status: hadErrors ? "partial" : "success",
	});
}
