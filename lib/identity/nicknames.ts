// carltonnorthern/nicknames (Apache-2.0) - a curated CSV of formal given
// names and their common nicknames/diminutives, e.g. "elizabeth,has_nickname,lizzie".
// Used to catch substitution-style nickname mismatches (Elizabeth/Lizzie,
// Robert/Bob) that a letter-prefix heuristic can't - verified against real
// unmatched US disclosure names before adopting this over a hand-rolled rule.
const NICKNAMES_CSV_URL = "https://raw.githubusercontent.com/carltonnorthern/nicknames/master/names.csv";

export type NicknameMap = Map<string, Set<string>>;

export async function loadNicknameMap(): Promise<NicknameMap> {
	const response = await fetch(NICKNAMES_CSV_URL);
	if (!response.ok) throw new Error(`Nicknames fetch failed: ${response.status}`);

	const text = await response.text();
	const map: NicknameMap = new Map();

	const addEdge = (a: string, b: string) => {
		if (!map.has(a)) map.set(a, new Set());
		map.get(a)!.add(b);
	};

	for (const line of text.split("\n").slice(1)) {
		const [name1, , name2] = line.trim().split(",");
		if (!name1 || !name2) continue;

		// Undirected: the CSV only records formal->nickname, but a disclosure's
		// slug might carry either the formal name or the nickname depending on
		// what the filer used, so both directions need to resolve as equivalent.
		addEdge(name1, name2);
		addEdge(name2, name1);
	}

	return map;
}

export function areNicknameEquivalent(map: NicknameMap, a: string, b: string): boolean {
	return map.get(a)?.has(b) ?? false;
}
