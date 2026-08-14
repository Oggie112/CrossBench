import { supabaseAdmin } from "../supabase";

const API_BASE = "https://committees-api.parliament.uk/api";
const MEMBERS_API_BASE = "https://members-api.parliament.uk/api";
const MEMBERS_PAGE_SIZE = 100;

interface OfficialRecord {
	mnisId: number;
	fullName: string;
	party: string | null;
	house: "Commons" | "Lords";
}

interface MemberSearchResult {
	items: {
		value: {
			id: number;
			nameDisplayAs: string;
			latestParty: { name: string } | null;
			latestHouseMembership: { house: 1 | 2 };
		};
	}[];
	totalResults: number;
}

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

async function fetchCurrentRoster(house: 1 | 2): Promise<OfficialRecord[]> {
	const members: OfficialRecord[] = [];
	let skip = 0;

	while (true) {
		const url = `${MEMBERS_API_BASE}/Members/Search?House=${house}&IsCurrentMember=true&Skip=${skip}&Take=${MEMBERS_PAGE_SIZE}`;
		const response = await fetch(url, { headers: { Accept: "application/json" } });
		if (!response.ok) throw new Error(`Members search fetch failed: ${response.status}`);

		const page: MemberSearchResult = await response.json();
		for (const item of page.items) {
			members.push({
				mnisId: item.value.id,
				fullName: item.value.nameDisplayAs,
				party: item.value.latestParty?.name ?? null,
				house: item.value.latestHouseMembership.house === 1 ? "Commons" : "Lords",
			});
		}

		skip += page.items.length;
		if (page.items.length === 0 || skip >= page.totalResults) break;
	}

	return members;
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

async function upsertOfficial(official: OfficialRecord): Promise<string> {
	const mnisId = String(official.mnisId);

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
			full_name: official.fullName,
			country: "UK",
			chamber: official.house,
			party: official.party,
			external_ids: { uk_mnis_id: mnisId },
		})
		.select("id")
		.single();

	if (error || !created) throw new Error(`Failed to create official ${official.fullName}: ${error?.message}`);
	return created.id;
}

// Seeds every current MP and Lord, independent of committee membership - the
// Committees API only surfaces the subset who sit on a Select Committee
// (most backbenchers don't), so relying on it alone left most of the roster
// unable to ever match a disclosure. Members API uses the same mnisId scheme
// as the Committees and Interests APIs, so upsertOfficial's existing
// upsert-by-mnisId logic needs no changes - committee crawling below just
// hits the "already exists" branch for everyone once this has run first.
async function seedRoster(): Promise<number> {
	const [commons, lords] = await Promise.all([fetchCurrentRoster(1), fetchCurrentRoster(2)]);
	const roster = [...commons, ...lords];

	for (const official of roster) await upsertOfficial(official);
	return roster.length;
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

			const officialId = await upsertOfficial({
				mnisId: member.memberInfo.mnisId,
				fullName: member.name,
				party: member.memberInfo.party,
				house: member.memberInfo.house,
			});
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
	console.log("Seeding full current roster (Commons + Lords)...");
	const rosterCount = await seedRoster();
	console.log(`${rosterCount} current members seeded`);

	console.log("Seeding UK Select committees and current membership...");
	const { officialIds, membershipCount } = await seedCommittees();
	console.log(`${officialIds.size} unique officials on a Select Committee, ${membershipCount} membership rows`);

	console.log("Backfilling disclosure_events.official_id...");
	const updated = await backfillDisclosureEvents();
	console.log(`Backfilled ${updated} disclosure_events rows`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
