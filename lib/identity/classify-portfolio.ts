import type { Sector } from "../committees/classify-committee";

// No EXCLUDE case here, unlike classify-committee.ts - every Commissioner
// portfolio is a real substantive remit (unlike committees, which include
// purely administrative/procedural bodies with no jurisdiction at all).
export type PortfolioClassification =
	| { kind: "sectors"; sectors: Sector[]; reason: string }
	| { kind: "general"; reason: string };

interface Rule {
	match: RegExp;
	classification: PortfolioClassification;
}

function sectors(sectors: Sector[], reason: string): PortfolioClassification {
	return { kind: "sectors", sectors, reason };
}
function general(reason: string): PortfolioClassification {
	return { kind: "general", reason };
}

// Matched against the real title text scraped from each commissioner's
// Commission bio page (lib/identity/eu-portfolio-source.ts) - a fixed list
// of 27 known titles for the current College, not a generalisable pattern
// system the way classify-committee.ts's 328 names needed to be. Keyword
// rules kept anyway (not a hardcoded name->classification map) so a minor
// title rewording between scrapes still matches instead of silently
// dropping to unclassified.
const RULES: Rule[] = [
	{ match: /defence and space/, classification: sectors(["Industrials"], "defence jurisdiction") },
	{ match: /sustainable transport and tourism/, classification: sectors(["Industrials", "Consumer Cyclical"], "transport named first") },
	{ match: /agriculture and food/, classification: sectors(["Consumer Defensive", "Basic Materials"], "food named before raw farm inputs") },
	{ match: /fisheries and oceans/, classification: sectors(["Consumer Defensive", "Basic Materials"], "fisheries as a food-supply and marine-resource portfolio") },
	{ match: /energy and housing/, classification: sectors(["Energy", "Real Estate"], "energy named first") },
	{ match: /the Mediterranean/, classification: general("a regional/geographic remit, not sector-specific") },
	{ match: /startups, research and innovation/, classification: sectors(["Technology"], "explicit in portfolio title") },
	{ match: /youth, culture and sport/, classification: sectors(["Consumer Cyclical", "Communication Services"], "culture/sport as leisure, media secondary") },
	{ match: /equality, preparedness and crisis management/, classification: general("broad social/crisis-policy remit") },
	{ match: /tech sovereignty, security and democracy/, classification: sectors(["Technology"], "explicit in portfolio title") },
	{ match: /environment, water resilience/, classification: sectors(["Utilities", "Basic Materials"], "environmental regulation ties most directly to utilities") },
	{ match: /international partnerships/, classification: general("foreign-aid/partnerships remit is broad") },
	{ match: /High Representative/, classification: general("foreign policy jurisdiction is broad, not sector-specific") },
	{ match: /internal affairs and migration/, classification: general("policing/immigration remit has no clean single-sector fit") },
	{ match: /financial services and the Savings and Investments Union/, classification: sectors(["Financial Services"], "explicit in portfolio title") },
	{ match: /trade and economic security/, classification: general("broad trade/institutional-relations remit") },
	{ match: /^Slovenian Commissioner responsible for enlargement/, classification: general("EU-accession policy is broad/geopolitical") },
	{ match: /democracy, justice, the rule of law/, classification: general("broad justice/rule-of-law remit") },
	{ match: /health and animal welfare/, classification: sectors(["Healthcare"], "explicit in portfolio title") },
	{ match: /budget, anti-fraud and public administration/, classification: general("matches the Budget Committee treatment - spans everything") },
	{ match: /cohesions and reforms/, classification: general("EU regional cohesion funds/structural reform policy is broad") },
	{ match: /social rights and skills, quality jobs/, classification: general("labour/social policy - no equivalent sector in the taxonomy") },
	{ match: /prosperity and industrial strategy/, classification: sectors(["Industrials"], "explicit in portfolio title") },
	{ match: /clean, just and competitive transition/, classification: sectors(["Energy", "Utilities"], "green/climate transition portfolio") },
	{ match: /President of the European Commission/, classification: general("oversees the whole Commission, not sector-specific") },
	{ match: /economy, productivity, implementing and simplifying EU law/, classification: general("broad macroeconomic and legal-simplification remit") },
	{ match: /climate, net zero and clean growth/, classification: sectors(["Energy", "Utilities"], "explicit in portfolio title") },
];

export function classifyPortfolio(title: string): PortfolioClassification | null {
	for (const rule of RULES) if (rule.match.test(title)) return rule.classification;
	return null;
}