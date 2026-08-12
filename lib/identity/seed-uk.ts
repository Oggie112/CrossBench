import { supabaseAdmin } from "../supabase";

const API_BASE = "https://committees-api.parliament.uk/api";

interface CommitteeListItem {
	id: number;
	name: string;
	house: "Commons" | "Lords" | "Joint";
	category: { id: number; name: string };
}

interface MemberRole {
	startDate: string;
	endDate: string | null;
	role: { name: string };
}

interface CommitteeMember {
	name: string;
	roles: MemberRole[];
	isLayMember: boolean;
	// null for lay members - external experts (e.g. on the Standards Committee)
	// who aren't elected and have no mnisId, so they can't be officials at all.
	memberInfo: {
		mnisId: number;
		party: string | null;
		house: "Commons" | "Lords";
	} | null;
}

async function fetchSelectCommittees(): Promise<CommitteeListItem[]> {
	const response = await fetch(`${API_BASE}/Committees?take=300`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`Committees fetch failed: ${response.status}`);

	const data = await response.json();
	const items: CommitteeListItem[] = data.items ?? data;
	return items.filter((c) => c.category?.name === "Select");
}

async function fetchCommitteeMembers(committeeId: number): Promise<CommitteeMember[]> {
	const response = await fetch(`${API_BASE}/Committees/${committeeId}/Members`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`Members fetch failed for committee ${committeeId}: ${response.status}`);

	const data = await response.json();
	return data.items ?? data;
}

async function upsertOfficial(name: string, memberInfo: NonNullable<CommitteeMember["memberInfo"]>): Promise<string> {
	const mnisId = String(memberInfo.mnisId);

	const { data: existing } = await supabaseAdmin
		.from("officials")
		.select("id")
		.eq("country", "UK")
		.contains("external_ids", { uk_mnis_id: mnisId })
		.maybeSingle();

	if (existing) return existing.id;

	const { data: created, error } = await supabaseAdmin
		.from("officials")
		.insert({
			full_name: name,
			country: "UK",
			chamber: memberInfo.house,
			party: memberInfo.party,
			external_ids: { uk_mnis_id: mnisId },
		})
		.select("id")
		.single();

	if (error || !created) throw new Error(`Failed to create official ${name}: ${error?.message}`);
	return created.id;
}

async function upsertCommittee(committee: CommitteeListItem): Promise<string> {
	const externalIds = { uk_committee_id: String(committee.id) };

	const { data: existing } = await supabaseAdmin
		.from("committees")
		.select("id")
		.eq("country", "UK")
		.eq("name", committee.name)
		.maybeSingle();

	if (existing) {
		// Backfills external_ids on committees seeded before this column existed.
		await supabaseAdmin.from("committees").update({ external_ids: externalIds }).eq("id", existing.id);
		return existing.id;
	}

	const { data: created, error } = await supabaseAdmin
		.from("committees")
		.insert({ name: committee.name, country: "UK", chamber: committee.house, external_ids: externalIds })
		.select("id")
		.single();

	if (error || !created) throw new Error(`Failed to create committee ${committee.name}: ${error?.message}`);
	return created.id;
}

async function seedMembership(officialId: string, committeeId: string, role: MemberRole): Promise<void> {
	const { error } = await supabaseAdmin.from("official_committee_memberships").upsert(
		{
			official_id: officialId,
			committee_id: committeeId,
			role: role.role.name,
			start_date: role.startDate.slice(0, 10),
			end_date: null,
		},
		{ onConflict: "official_id,committee_id,start_date" },
	);

	if (error) throw new Error(`Failed to seed membership: ${error.message}`);
}

// Historical committee membership goes back decades with real dates, but
// officials are seeded current-roster-only (see 3RNK.1 planning) - seeding
// past memberships would reference officials that don't exist in that table,
// violating the FK. Only currently-active roles (endDate === null) qualify.
async function seedCommittees(): Promise<{ officialIds: Set<string>; membershipCount: number }> {
	const committees = await fetchSelectCommittees();
	console.log(`${committees.length} Select committees found`);

	const officialIds = new Set<string>();
	let membershipCount = 0;

	for (const committee of committees) {
		const committeeId = await upsertCommittee(committee);
		const members = await fetchCommitteeMembers(committee.id);

		for (const member of members) {
			if (member.isLayMember || !member.memberInfo) continue;

			const activeRoles = member.roles.filter((r) => r.endDate === null);
			if (activeRoles.length === 0) continue;

			const officialId = await upsertOfficial(member.name, member.memberInfo);
			officialIds.add(officialId);

			for (const role of activeRoles) {
				await seedMembership(officialId, committeeId, role);
				membershipCount++;
			}
		}
	}

	return { officialIds, membershipCount };
}

async function backfillDisclosureEvents(): Promise<number> {
	const { data: officials } = await supabaseAdmin.from("officials").select("id, external_ids").eq("country", "UK");
	if (!officials) return 0;

	let updated = 0;
	for (const official of officials) {
		const mnisId = (official.external_ids as Record<string, string> | null)?.uk_mnis_id;
		if (!mnisId) continue;

		const { data, error } = await supabaseAdmin
			.from("disclosure_events")
			.update({ official_id: official.id })
			.eq("country", "UK")
			.eq("official_external_id", mnisId)
			.is("official_id", null)
			.select("id");

		if (error) throw new Error(`Backfill failed for official ${official.id}: ${error.message}`);
		updated += data?.length ?? 0;
	}

	return updated;
}

async function main() {
	console.log("Seeding UK Select committees and current membership...");
	const { officialIds, membershipCount } = await seedCommittees();
	console.log(`${officialIds.size} unique officials, ${membershipCount} membership rows`);

	console.log("Backfilling disclosure_events.official_id...");
	const updated = await backfillDisclosureEvents();
	console.log(`Backfilled ${updated} disclosure_events rows`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
