import { ukAdapter } from "@/lib/adapters/uk";
import { euAdapter } from "@/lib/adapters/eu";
import { usHouseAdapter } from "@/lib/adapters/us-house";
import { usSenateAdapter } from "@/lib/adapters/us-senate";
import { runIngestion } from "@/lib/ingestion/run-source";
import { supabaseAdmin } from "@/lib/supabase";

const adapters = [ukAdapter, euAdapter, usHouseAdapter, usSenateAdapter];

export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return new Response("Unauthorized", { status: 401 });
	}

	// Sources run one at a time and independently - a failure in one (e.g. the
	// Senate feed going stale) shouldn't stop the others from ingesting.
	const results = [];
	for (const adapter of adapters) {
		results.push(await runIngestion(adapter));
	}

	// Refresh runs regardless of individual source outcomes above - even a
	// partial ingestion is worth reflecting in the ranking views, and a
	// refresh failure shouldn't be reported as an ingestion failure.
	const { error: refreshError } = await supabaseAdmin.rpc("refresh_ranking_views");

	return Response.json({
		results,
		refresh: refreshError ? { status: "failed", error: refreshError.message } : { status: "success" },
	});
}
