import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Publishable key - safe for Server Components reading public disclosure data under RLS.
export const supabase = createClient<Database>(
	supabaseUrl,
	process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

// Secret key - server-only, bypasses RLS. Ingestion adapters write with this since
// raw_documents/disclosure_events aren't meant to be publicly insertable.
export const supabaseAdmin = createClient<Database>(
	supabaseUrl,
	process.env.SUPABASE_SECRET_KEY!,
);
