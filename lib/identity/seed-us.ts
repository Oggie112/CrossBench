import { load } from "js-yaml";
import { writeFileSync } from "fs";
import { supabaseAdmin } from "../supabase";
import { slugifyWord } from "../adapters/name-slug";
import { loadNicknameMap, areNicknameEquivalent, type NicknameMap } from "./nicknames";

const LEGISLATORS_URL =
	"https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml";
const COMMITTEES_URL =
	"https://raw.githubusercontent.com/unitedstates/congress-legislators/main/committees-current.yaml";
const MEMBERSHIP_URL =
	"https://raw.githubusercontent.com/unitedstates/congress-legislators/main/committee-membership-current.yaml";

// committee-membership-current.yaml has no per-membership dates at all
// (unlike the UK committees API), so this stands in for "since this
// Congress began" - wrong only for mid-session reassignments, which this
// source doesn't expose regardless.
const CONGRESS_START_DATE = "2025-01-03";

const NOTES_PATH = "lib/identity/us-unmatched.md";

interface Legislator {
	id: { bioguide: string };
	name: { first: string; last: string; official_full: string };
	terms: { type: "rep" | "sen"; party?: string }[];
}

interface Subcommittee {
	name: string;
	thomas_id: string;
}

interface Committee {
	type: "house" | "senate" | "joint";
	name: string;
	thomas_id: string;
	subcommittees?: Subcommittee[];
}

interface MembershipEntry {
	bioguide: string;
	title?: string;
}

type Chamber = "House" | "Senate" | "Joint";

async function fetchYaml<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Fetch failed for ${url}: ${response.status}`);
	return load(await response.text()) as T;
}

function chamberFromTermType(type: "rep" | "sen"): "House" | "Senate" {
	return type === "rep" ? "House" : "Senate";
}

function chamberFromCommitteeType(type: "house" | "senate" | "joint"): Chamber {
	if (type === "house") return "House";
	if (type === "senate") return "Senate";
	return "Joint";
}

interface OfficialInfo {
	id: string;
	chamber: "House" | "Senate";
	fullName: string;
}

async function seedOfficials(legislators: Legislator[]): Promise<Map<string, OfficialInfo>> {
	const bioguideToOfficial = new Map<string, OfficialInfo>();

	for (const legislator of legislators) {
		const bioguide = legislator.id.bioguide;
		const currentTerm = legislator.terms[legislator.terms.length - 1];
		const chamber = chamberFromTermType(currentTerm.type);

		const { data: existing } = await supabaseAdmin
			.from("officials")
			.select("id")
			.eq("country", "US")
			.contains("external_ids", { us_bioguide_id: bioguide })
			.maybeSingle();

		if (existing) {
			bioguideToOfficial.set(bioguide, { id: existing.id, chamber, fullName: legislator.name.official_full });
			continue;
		}

		const { data: created, error } = await supabaseAdmin
			.from("officials")
			.insert({
				full_name: legislator.name.official_full,
				country: "US",
				chamber,
				party: currentTerm.party ?? null,
				external_ids: { us_bioguide_id: bioguide },
			})
			.select("id")
			.single();

		if (error || !created) {
			throw new Error(`Failed to create official ${legislator.name.official_full}: ${error?.message}`);
		}
		bioguideToOfficial.set(bioguide, { id: created.id, chamber, fullName: legislator.name.official_full });
	}

	return bioguideToOfficial;
}

async function upsertCommittee(name: string, chamber: Chamber, thomasId: string): Promise<string> {
	const externalIds = { thomas_id: thomasId };

	const { data: existing } = await supabaseAdmin
		.from("committees")
		.select("id")
		.eq("country", "US")
		.eq("name", name)
		.maybeSingle();

	if (existing) {
		await supabaseAdmin.from("committees").update({ external_ids: externalIds }).eq("id", existing.id);
		return existing.id;
	}

	const { data: created, error } = await supabaseAdmin
		.from("committees")
		.insert({ name, country: "US", chamber, external_ids: externalIds })
		.select("id")
		.single();

	if (error || !created) throw new Error(`Failed to create committee ${name}: ${error?.message}`);
	return created.id;
}

async function seedCommittees(committees: Committee[]): Promise<Map<string, string>> {
	const thomasIdToCommitteeId = new Map<string, string>();

	for (const committee of committees) {
		const chamber = chamberFromCommitteeType(committee.type);
		const parentId = await upsertCommittee(committee.name, chamber, committee.thomas_id);
		thomasIdToCommitteeId.set(committee.thomas_id, parentId);

		for (const sub of committee.subcommittees ?? []) {
			// committee-membership-current.yaml keys subcommittees by the parent
			// and subcommittee thomas_id concatenated with no separator (e.g.
			// "HSAG15") - confirmed against the real file.
			const key = `${committee.thomas_id}${sub.thomas_id}`;
			const subId = await upsertCommittee(`${committee.name} - ${sub.name}`, chamber, key);
			thomasIdToCommitteeId.set(key, subId);
		}
	}

	return thomasIdToCommitteeId;
}

async function seedMemberships(
	membership: Record<string, MembershipEntry[]>,
	thomasIdToCommitteeId: Map<string, string>,
	bioguideToOfficial: Map<string, OfficialInfo>,
): Promise<number> {
	let count = 0;

	for (const [thomasId, entries] of Object.entries(membership)) {
		const committeeId = thomasIdToCommitteeId.get(thomasId);
		if (!committeeId) continue; // references a committee not in committees-current (e.g. defunct)

		for (const entry of entries) {
			const official = bioguideToOfficial.get(entry.bioguide);
			if (!official) continue; // not in the current roster - don't assume, just skip

			const { error } = await supabaseAdmin.from("official_committee_memberships").upsert(
				{
					official_id: official.id,
					committee_id: committeeId,
					role: entry.title ?? "Member",
					start_date: CONGRESS_START_DATE,
					end_date: null,
				},
				{ onConflict: "official_id,committee_id,start_date" },
			);
			if (error) throw new Error(`Failed to seed membership: ${error.message}`);
			count++;
		}
	}

	return count;
}

interface SlugCandidate {
	officialId: string;
	firstNameSlug: string;
}

function buildMatchIndexes(legislators: Legislator[], bioguideToOfficial: Map<string, OfficialInfo>) {
	const exactSlugToId = new Map<string, string>();
	const lastNameToCandidates = new Map<string, SlugCandidate[]>();

	for (const legislator of legislators) {
		const official = bioguideToOfficial.get(legislator.id.bioguide);
		if (!official) continue;

		const firstNameSlug = slugifyWord(legislator.name.first);
		const lastNameSlug = slugifyWord(legislator.name.last);

		exactSlugToId.set(`${firstNameSlug}-${lastNameSlug}`, official.id);

		if (!lastNameToCandidates.has(lastNameSlug)) lastNameToCandidates.set(lastNameSlug, []);
		lastNameToCandidates.get(lastNameSlug)!.push({ officialId: official.id, firstNameSlug });
	}

	return { exactSlugToId, lastNameToCandidates };
}

interface DisclosureRow {
	official_external_id: string;
	raw_documents: { source_name: string } | null;
}

async function fetchUnmatchedUsRows(): Promise<DisclosureRow[]> {
	const rows: DisclosureRow[] = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		const { data, error } = await supabaseAdmin
			.from("disclosure_events")
			.select("official_external_id, raw_documents(source_name)")
			.eq("country", "US")
			.is("official_id", null)
			.range(from, from + pageSize - 1);
		if (error) throw error;
		rows.push(...(data as unknown as DisclosureRow[]));
		if (data.length < pageSize) break;
		from += pageSize;
	}
	return rows;
}

interface UnmatchedNote {
	slug: string;
	reason: string;
}

interface ChamberMismatchNote {
	slug: string;
	officialName: string;
	expectedChamber: string;
	actualChamber: string;
}

async function backfillDisclosureEvents(
	exactSlugToId: Map<string, string>,
	lastNameToCandidates: Map<string, SlugCandidate[]>,
	officialIdToInfo: Map<string, OfficialInfo>,
	nicknameMap: NicknameMap,
): Promise<{ matchedSlugs: number; unmatched: UnmatchedNote[]; chamberMismatches: ChamberMismatchNote[] }> {
	const rows = await fetchUnmatchedUsRows();

	const rowsBySlug = new Map<string, DisclosureRow[]>();
	for (const row of rows) {
		if (!rowsBySlug.has(row.official_external_id)) rowsBySlug.set(row.official_external_id, []);
		rowsBySlug.get(row.official_external_id)!.push(row);
	}

	let matchedSlugs = 0;
	const unmatched: UnmatchedNote[] = [];
	const chamberMismatches: ChamberMismatchNote[] = [];

	for (const [slug, slugRows] of rowsBySlug) {
		let officialId = exactSlugToId.get(slug);

		if (!officialId) {
			const parts = slug.split("-");
			if (parts.length >= 2) {
				officialId = exactSlugToId.get(`${parts[0]}-${parts[parts.length - 1]}`);

				if (!officialId) {
					const candidateFirst = parts[0];
					const candidateLast = parts[parts.length - 1];
					const candidates = lastNameToCandidates.get(candidateLast) ?? [];
					const nicknameMatches = candidates.filter((c) =>
						areNicknameEquivalent(nicknameMap, candidateFirst, c.firstNameSlug),
					);

					if (nicknameMatches.length === 1) {
						officialId = nicknameMatches[0].officialId;
					} else if (nicknameMatches.length > 1) {
						unmatched.push({ slug, reason: `ambiguous nickname match (${nicknameMatches.length} candidates)` });
						continue;
					}
				}
			}
		}

		if (!officialId) {
			unmatched.push({ slug, reason: "no match in current roster" });
			continue;
		}

		const official = officialIdToInfo.get(officialId)!;
		const sourceNames = new Set(slugRows.map((r) => r.raw_documents?.source_name).filter(Boolean));
		const expectedChamber =
			sourceNames.size === 1
				? sourceNames.has("us_house_ptr")
					? "House"
					: sourceNames.has("us_senate_kadoa")
						? "Senate"
						: null
				: null;

		if (expectedChamber && expectedChamber !== official.chamber) {
			chamberMismatches.push({
				slug,
				officialName: official.fullName,
				expectedChamber,
				actualChamber: official.chamber,
			});
			continue; // flag, don't write - a chamber disagreement is a reason to distrust this match
		}

		const { error } = await supabaseAdmin
			.from("disclosure_events")
			.update({ official_id: officialId })
			.eq("country", "US")
			.eq("official_external_id", slug)
			.is("official_id", null);

		if (error) throw new Error(`Backfill failed for slug ${slug}: ${error.message}`);
		matchedSlugs++;
	}

	return { matchedSlugs, unmatched, chamberMismatches };
}

function writeNotes(unmatched: UnmatchedNote[], chamberMismatches: ChamberMismatchNote[]): void {
	const lines = [
		`# US officials matching - unresolved cases`,
		``,
		`Generated by \`seed-us.ts\`. Not committed - see .gitignore.`,
		``,
		`## Unmatched (${unmatched.length})`,
		``,
		...unmatched.map((u) => `- \`${u.slug}\` - ${u.reason}`),
		``,
		`## Chamber mismatches (${chamberMismatches.length})`,
		``,
		...chamberMismatches.map(
			(c) => `- \`${c.slug}\` matched **${c.officialName}** (${c.actualChamber}) but came from a ${c.expectedChamber} filing`,
		),
	];
	writeFileSync(NOTES_PATH, lines.join("\n"));
}

async function main() {
	console.log("Fetching congress-legislators data...");
	const [legislators, committees, membership] = await Promise.all([
		fetchYaml<Legislator[]>(LEGISLATORS_URL),
		fetchYaml<Committee[]>(COMMITTEES_URL),
		fetchYaml<Record<string, MembershipEntry[]>>(MEMBERSHIP_URL),
	]);
	console.log(`${legislators.length} legislators, ${committees.length} committees`);

	console.log("Seeding officials...");
	const bioguideToOfficial = await seedOfficials(legislators);

	console.log("Seeding committees...");
	const thomasIdToCommitteeId = await seedCommittees(committees);

	console.log("Seeding memberships...");
	const membershipCount = await seedMemberships(membership, thomasIdToCommitteeId, bioguideToOfficial);
	console.log(`${membershipCount} membership rows`);

	console.log("Loading nickname map...");
	const nicknameMap = await loadNicknameMap();

	const officialIdToInfo = new Map<string, OfficialInfo>();
	for (const info of bioguideToOfficial.values()) officialIdToInfo.set(info.id, info);

	console.log("Backfilling disclosure_events.official_id...");
	const { exactSlugToId, lastNameToCandidates } = buildMatchIndexes(legislators, bioguideToOfficial);
	const { matchedSlugs, unmatched, chamberMismatches } = await backfillDisclosureEvents(
		exactSlugToId,
		lastNameToCandidates,
		officialIdToInfo,
		nicknameMap,
	);

	writeNotes(unmatched, chamberMismatches);
	console.log(
		`Matched ${matchedSlugs} unique slugs. ${unmatched.length} unmatched, ${chamberMismatches.length} chamber mismatches - see ${NOTES_PATH}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
