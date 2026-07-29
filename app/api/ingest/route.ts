import { ukAdapter } from "@/lib/adapters/uk";
import { euAdapter } from "@/lib/adapters/eu";
import { usHouseAdapter } from "@/lib/adapters/us-house";
import { usSenateAdapter } from "@/lib/adapters/us-senate";
import { runIngestion } from "@/lib/ingestion/run-source";

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

	return Response.json({ results });
}
