const COLLEGE_URL = "https://commission.europa.eu/about/organisation/college-commissioners_en";

interface ProfilePage {
	name: string;
	portfolio: string | null;
}

// Considered Wikidata first, dropped it after testing against real data: it
// missed one of 27 commissioners entirely (zero current P39 claims), needed
// a hand-broadened label pattern to even catch the President and High
// Representative's non-"Commissioner" titles, and its labels are just a
// derived, crowd-sourced rendering of the exact same fact the Commission's
// own site states directly and more completely. One source, not two.
let cachedProfiles: ProfilePage[] | null = null;

// The President isn't listed under /college-commissioners/<slug>_en like
// everyone else - she has her own /about/organisation/president_en page.
// That link is discovered from the listing page itself (a structural
// pattern, true for whoever holds the role) rather than matched by name, so
// nothing here breaks when the presidency changes hands.
async function discoverProfileUrls(): Promise<string[]> {
	const response = await fetch(COLLEGE_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
	if (!response.ok) throw new Error(`Commission college page fetch failed: ${response.status}`);
	const html = await response.text();

	const utilitySlugs = new Set(["calendar-items-president-and-commissioners", "commissioners-project-groups", "former-colleges-commissioners"]);
	const commissionerSlugs = [...html.matchAll(/href="\/about\/organisation\/college-commissioners\/([a-z-]+)_en"/g)]
		.map((m) => m[1])
		.filter((s, i, arr) => arr.indexOf(s) === i && !utilitySlugs.has(s));

	const urls = commissionerSlugs.map((slug) => `https://commission.europa.eu/about/organisation/college-commissioners/${slug}_en`);
	if (/href="\/about\/organisation\/president_en"/.test(html)) {
		urls.push("https://commission.europa.eu/about/organisation/president_en");
	}
	return urls;
}

// Each bio page states the role in a consistent "<Name> is the <title>."
// sentence - verified against a regular Commissioner and an Executive
// Vice-President - and gives the person's own display name in a <h1>,
// which is what fullName gets matched against, not the URL slug (slugs drop
// middle names/second surnames inconsistently - e.g. "Teresa Ribera
// Rodríguez" -> "teresa-ribera" - so matching on the page's own stated name
// is more reliable than reconstructing or guessing the slug).
async function fetchProfilePage(url: string): Promise<ProfilePage | null> {
	const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
	if (!response.ok) return null;
	const html = await response.text();

	const nameMatch = html.match(/<h1[^>]*>\s*<span>([^<]+)<\/span>/);
	if (!nameMatch) return null;

	const sentenceMatch = html.match(/is the ([^<.]+)\./);
	const portfolio = sentenceMatch ? sentenceMatch[1].replace(/\s+in the (second|first|third) von der Leyen Commission$/i, "").trim() : null;

	return { name: nameMatch[1].trim(), portfolio };
}

async function fetchAllProfiles(): Promise<ProfilePage[]> {
	if (cachedProfiles) return cachedProfiles;

	const urls = await discoverProfileUrls();
	const profiles: ProfilePage[] = [];
	for (const url of urls) {
		const profile = await fetchProfilePage(url);
		if (profile) profiles.push(profile);
	}

	cachedProfiles = profiles;
	return profiles;
}

function namesOverlap(a: string, b: string): boolean {
	const tokens = (s: string) =>
		s
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.split(/\s+/)
			.filter((t) => t.length > 2);
	const aTokens = tokens(a);
	const bTokens = tokens(b);
	const firstMatches = aTokens[0] === bTokens[0];
	const anySurnameMatches = aTokens.slice(1).some((t) => bTokens.includes(t));
	return firstMatches && anySurnameMatches;
}

export async function fetchPortfolio(fullName: string): Promise<string | null> {
	const profiles = await fetchAllProfiles();
	const match = profiles.find((p) => namesOverlap(fullName, p.name));
	return match?.portfolio ?? null;
}