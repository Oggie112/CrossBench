// The 11 sectors securities.sector/committee_sector_relevance.sector already
// use (Yahoo Finance's own taxonomy - see docs/plan/3rnk1-prerequisites.md
// step 1). Kept as a literal union here so a typo in a rule below is a
// compile error, not a silent mismatch against what's actually in the DB.
export type Sector =
	| "Technology"
	| "Financial Services"
	| "Healthcare"
	| "Consumer Cyclical"
	| "Consumer Defensive"
	| "Energy"
	| "Utilities"
	| "Real Estate"
	| "Basic Materials"
	| "Industrials"
	| "Communication Services";

// Where a committee has more than one relevant sector, order matters: the
// first is treated as primary (weight 1), the rest as secondary (weight
// 0.5) by the seeding script - not a flat list of equals.
export type Classification =
	| { kind: "sectors"; sectors: Sector[]; reason: string }
	| { kind: "general"; reason: string }
	| { kind: "exclude"; reason: string };

interface Rule {
	match: RegExp;
	classification: Classification;
}

function sectors(sectors: Sector[], reason: string): Classification {
	return { kind: "sectors", sectors, reason };
}
function general(reason: string): Classification {
	return { kind: "general", reason };
}
function exclude(reason: string): Classification {
	return { kind: "exclude", reason };
}

// Checked first, in order, against the full committee name - a private
// bill or procedural body should never fall through to a sector match just
// because its name happens to contain a topical word (e.g. "High Speed
// Rail (Crewe - Manchester) Bill" is a one-off bill-scrutiny committee, not
// ongoing transport-sector oversight, despite the obvious keyword).
const EXCLUDE_RULES: Rule[] = [
	{
		match: /\bBills?\b/,
		classification: exclude("one-off private/hybrid bill scrutiny committee, not ongoing sector oversight"),
	},
	{
		match: /Armed Forces Bill/,
		classification: exclude("quinquennial bill-renewal scrutiny, not ongoing defence oversight"),
	},
	{
		match: /Ethics|Standards|Conduct|Privileges/,
		classification: exclude("conduct/standards body - no sector jurisdiction"),
	},
	{
		match: /Intelligence/,
		classification: exclude("matches Peez49 methodology directly - sensitive oversight body, not sector-mappable"),
	},
	{
		match: /Select Subcommittee to Investigate the Remaining Questions Surrounding January 6/,
		classification: exclude("historical/investigative, not ongoing sector oversight"),
	},
	{
		match: /Joint Committee on Printing|Joint Committee of Congress on the Library|House Administration|Rules and Administration|^House Committee on Rules|^House Committee on Rules - /,
		classification: exclude("internal chamber administration/procedure - matches Peez49's Printing/Library exclusions"),
	},
	{
		match: /Administration Committee$|Backbench Business|Committee of Selection|Finance Committee \(Commons\)|Finance Committee \(Lords\)|House of Lords Commission|Hybrid Instruments|Liaison (Committee|Sub-Committee)|Members Estimate|Modernisation Committee|Palace of Westminster|Panel of Chairs|Procedure( and Privileges)? Committee|Retirement and Participation|^Services Committee$|Speaker's Conference|Standing Orders|Sub-Committee on Leave of Absence/,
		classification: exclude("internal chamber business/administration - no sector jurisdiction"),
	},
	{
		match: /Statutory Instruments|Delegated Powers and Regulatory Reform|Secondary Legislation Scrutiny/,
		classification: exclude("scrutinises secondary legislation across all topics - cross-cutting, not sector-specific"),
	},
	{
		match: /United States Senate Caucus/,
		classification: exclude("informal caucus, not a committee with real jurisdiction"),
	},
];

// Checked second, against the SUBCOMMITTEE portion only (after " - "), so a
// specific subcommittee topic can override its parent's broader/general
// classification - e.g. "Oversight and Government Reform" is general, but
// its "Health Care and Financial Services" subcommittee genuinely isn't.
const SUBCOMMITTEE_RULES: Rule[] = [
	{ match: /^Oversight/, classification: general("oversight-only subcommittees are investigative, not sector-focused") },
	{ match: /Health Care and Financial Services/, classification: sectors(["Healthcare", "Financial Services"], "health named first in subcommittee title") },
	{ match: /Economic Growth, Energy Policy/, classification: sectors(["Energy"], "explicit topic in subcommittee name") },
	{ match: /^Health\b|Health, Employment/, classification: sectors(["Healthcare"], "explicit topic in subcommittee name") },
	{ match: /^Energy\b/, classification: sectors(["Energy"], "explicit topic in subcommittee name") },
	{ match: /Communications and Technology|Telecommunications and Media/, classification: sectors(["Communication Services", "Technology"], "communications/media named first") },
	{ match: /Digital Assets/, classification: sectors(["Financial Services", "Technology"], "digital-asset/derivatives market regulation is closer to financial-markets oversight than its parent committee's usual remit") },
	{ match: /Courts, Intellectual Property, Artificial Intelligence|^Intellectual Property$|Privacy, Technology/, classification: sectors(["Technology", "Communication Services"], "technology/AI named first") },
	{ match: /^Environment\b/, classification: sectors(["Utilities", "Basic Materials"], "environmental regulation ties most directly to utilities") },
	{ match: /Social Security/, classification: sectors(["Financial Services"], "pensions/retirement is a financial-services topic") },
	{ match: /^Tax\b|Taxation/, classification: general("tax policy is genuinely cross-sector, not specific insight into one") },
	{ match: /^Trade\b/, classification: sectors(["Industrials", "Consumer Cyclical"], "trade/tariff policy affects manufacturing most directly, imports secondarily") },
	{ match: /^Housing and Insurance$/, classification: sectors(["Financial Services", "Real Estate"], "a Financial Services subcommittee - insurance/mortgage finance over pure housing") },
	{ match: /Capital Markets|Financial Institutions/, classification: sectors(["Financial Services"], "explicit topic in subcommittee name") },
];

// Checked third, against the PARENT/base committee name (or the whole name
// for committees with no subcommittee structure).
const PARENT_RULES: Rule[] = [
	{ match: /Agriculture/, classification: sectors(["Consumer Defensive", "Basic Materials"], "food/retail end named before raw farm inputs") },
	{ match: /^(House|Senate) Committee on Appropriations$/, classification: general("bare parent spans all spending categories - subcommittees are the specific ones") },
	{ match: /Appropriations.*Defense|Appropriations.*Homeland Security|Appropriations.*Military Construction/, classification: sectors(["Industrials"], "defence/security spending") },
	{ match: /Appropriations.*Energy and Water/, classification: sectors(["Energy", "Utilities"], "energy named first") },
	{ match: /Appropriations.*Financial Services/, classification: sectors(["Financial Services"], "financial-services spending") },
	{ match: /Appropriations.*(Labor, Health|Departments of Labor)/, classification: sectors(["Healthcare"], "health/labor spending") },
	{ match: /Appropriations.*(Interior, Environment|Interior, Env)/, classification: sectors(["Basic Materials", "Energy", "Utilities"], "Interior (land/resources) named first") },
	{ match: /Appropriations.*Transportation, Housing/, classification: sectors(["Industrials", "Real Estate"], "transportation named first") },
	{ match: /Appropriations.*Agriculture/, classification: sectors(["Consumer Defensive"], "agriculture spending") },
	{ match: /Appropriations.*Legislative Branch/, classification: exclude("internal Congress funding, not a sector") },
	{ match: /Appropriations/, classification: general("remaining Appropriations subcommittees span multiple/general categories") },
	{ match: /Armed Services/, classification: sectors(["Industrials"], "defence jurisdiction") },
	{ match: /Education and Workforce|^Education Committee$/, classification: general("no equivalent sector in the Yahoo taxonomy") },
	{ match: /Energy and Commerce/, classification: general("bare parent is broad - subcommittee rules above cover the specific ones") },
	{ match: /Financial Services/, classification: sectors(["Financial Services"], "explicit in committee name") },
	{ match: /Foreign Affairs|Foreign Relations/, classification: general("foreign policy is broad, not sector-specific") },
	{ match: /Homeland Security/, classification: sectors(["Industrials"], "security/infrastructure protection jurisdiction") },
	{ match: /Natural Resources/, classification: sectors(["Basic Materials", "Energy"], "raw resources named first") },
	{ match: /Oversight and Government Reform|Oversight and Investigations$/, classification: general("government-oversight jurisdiction, not sector-specific") },
	{ match: /Science, Space, and Technology|Science and Technology Committee|Science, Innovation and Technology/, classification: sectors(["Technology"], "explicit in committee name") },
	{ match: /Small Business/, classification: general("cross-sector by definition - oversees small business policy broadly") },
	{ match: /^(House|Senate) Committee on the Budget$/, classification: general("matches Peez49 methodology - budget committees are general") },
	{ match: /the Judiciary/, classification: general("courts/legal system jurisdiction is broad, not sector-specific") },
	{ match: /Transportation and Infrastructure|Commerce, Science, and Transportation/, classification: sectors(["Industrials"], "explicit in committee name") },
	{ match: /Veterans.? Affairs/, classification: sectors(["Healthcare"], "predominantly VA healthcare/benefits jurisdiction") },
	{ match: /Ways and Means/, classification: general("bare parent spans tax/trade/healthcare funding broadly - subcommittee rules above cover the specific ones") },
	{ match: /Joint Committee on Taxation|Joint Economic Committee/, classification: general("tax/economic policy is cross-sector") },
	{ match: /Commission on Security and Cooperation in Europe/, classification: general("broad European security/human rights remit") },
	{ match: /Strategic Competition Between the United States and the Chinese Communist Party/, classification: general("cross-cutting geopolitical remit (trade, military, tech, human rights)") },
	{ match: /Banking, Housing, and Urban Affairs/, classification: sectors(["Financial Services", "Real Estate"], "banking named first") },
	{ match: /Energy and Natural Resources/, classification: sectors(["Energy", "Basic Materials", "Utilities"], "energy named first") },
	{ match: /Environment and Public Works/, classification: sectors(["Utilities", "Basic Materials", "Industrials"], "environmental regulation over public-works construction") },
	{ match: /^Senate Committee on Finance$/, classification: general("bare parent spans tax/trade/healthcare funding broadly, same as Ways and Means") },
	{ match: /Finance.*Health Care/, classification: sectors(["Healthcare"], "explicit in subcommittee name") },
	{ match: /Finance.*Energy, Natural Resources/, classification: sectors(["Energy", "Industrials"], "energy named first") },
	{ match: /Finance.*International Trade/, classification: sectors(["Industrials", "Consumer Cyclical"], "manufacturing/exports over imports") },
	{ match: /Finance.*Social Security, Pensions/, classification: sectors(["Financial Services"], "pensions/retirement") },
	{ match: /Finance.*Taxation|Finance.*Fiscal Responsibility/, classification: general("tax/fiscal policy is cross-sector") },
	{ match: /Health, Education, Labor, and Pensions.*Primary Health/, classification: sectors(["Healthcare", "Financial Services"], "health named first") },
	{ match: /Health, Education, Labor, and Pensions/, classification: general("bare HELP committee spans health/education/labor broadly") },
	{ match: /Homeland Security and Governmental Affairs/, classification: general("governmental-affairs half broadens this beyond a single sector") },
	{ match: /Indian Affairs/, classification: general("tribal affairs is cross-cutting, no clean single-sector fit") },
	{ match: /Special Committee on Aging/, classification: sectors(["Healthcare", "Financial Services"], "Medicare/long-term care over pure retirement finance") },

	// UK
	{ match: /Built Environment/, classification: sectors(["Real Estate", "Industrials"], "explicit in committee name") },
	{ match: /Business and Trade Sub-Committee on Economic Security, Arms and Export Controls/, classification: sectors(["Industrials"], "arms export control jurisdiction") },
	{ match: /Business and Trade/, classification: general("bare committee spans all business/trade policy") },
	{ match: /Committees on Arms Export Controls/, classification: sectors(["Industrials"], "defence-manufacturing export licensing") },
	{ match: /Childhood Vaccinations/, classification: sectors(["Healthcare"], "explicit in committee name") },
	{ match: /Communications and Digital/, classification: sectors(["Communication Services", "Technology"], "communications named first") },
	{ match: /Culture, Media and Sport/, classification: sectors(["Communication Services", "Consumer Cyclical"], "media regulation over sport/leisure") },
	{ match: /^Defence Committee$|Defence Sub-Committee/, classification: sectors(["Industrials"], "explicit in committee name") },
	{ match: /Domestic Abuse Act 2021/, classification: general("post-legislative scrutiny of a specific Act, not an ongoing sector remit") },
	{ match: /Economic Affairs Committee/, classification: general("macroeconomic policy is broad, not sector-specific") },
	{ match: /Energy Security and Net Zero/, classification: sectors(["Energy", "Utilities"], "explicit in committee name") },
	{ match: /Environment and Climate Change|Environmental Audit/, classification: sectors(["Utilities", "Energy", "Basic Materials"], "climate/emissions regulation over raw materials") },
	{ match: /Environment, Food and Rural Affairs/, classification: sectors(["Consumer Defensive", "Basic Materials"], "food named before rural/agri inputs") },
	{ match: /European Affairs Committee/, classification: general("broad EU relations remit") },
	{ match: /Financial Services Regulation/, classification: sectors(["Financial Services"], "explicit in committee name") },
	{ match: /^Foreign Affairs Committee$/, classification: general("foreign policy is broad, not sector-specific") },
	{ match: /Health and Social Care/, classification: sectors(["Healthcare"], "explicit in committee name") },
	{ match: /^Home Affairs Committee$/, classification: general("policing/immigration/borders remit has no clean single-sector fit") },
	{ match: /Housing, Communities and Local Government/, classification: sectors(["Real Estate"], "explicit in committee name") },
	{ match: /Human Rights \(Joint Committee\)/, classification: general("cross-cutting human-rights scrutiny") },
	{ match: /Industry and Regulators/, classification: sectors(["Industrials", "Utilities"], "industry named first") },
	{ match: /International Agreements|International Development/, classification: general("treaty scrutiny/foreign aid policy is broad") },
	{ match: /International Relations and Defence/, classification: sectors(["Industrials"], "defence half of the remit") },
	{ match: /Justice and Home Affairs|^Justice Committee$/, classification: general("courts/justice system remit has no clean single-sector fit") },
	{ match: /National Resilience|National Security Strategy/, classification: general("cross-cutting preparedness/security strategy") },
	{ match: /Northern Ireland|Scottish Affairs|Welsh Affairs/, classification: general("regional affairs is cross-cutting, not sector-specific") },
	{ match: /Numeracy for Life/, classification: general("education/skills topic, no equivalent sector in the taxonomy") },
	{ match: /Public Accounts/, classification: general("scrutinises government spending broadly - matches Peez49's Appropriations treatment") },
	{ match: /Constitution Committee/, classification: general("constitutional scrutiny is cross-cutting, not sector-specific") },
	{ match: /Petitions Committee/, classification: general("handles public petitions on any topic - inherently cross-cutting") },
	{ match: /Public Administration and Constitutional Affairs|Public Services Committee/, classification: general("civil service/constitution/public-service delivery is broad") },
	{ match: /Social Mobility Policy|Women and Equalities/, classification: general("social policy remit, no equivalent sector in the taxonomy") },
	{ match: /^Transport Committee$/, classification: sectors(["Industrials"], "explicit in committee name") },
	{ match: /Treasury Committee|Treasury Sub-Committee/, classification: sectors(["Financial Services"], "explicit in committee name") },
	{ match: /Work and Pensions/, classification: sectors(["Financial Services"], "pensions/retirement jurisdiction") },
];

export function classifyCommittee(name: string): Classification | null {
	for (const rule of EXCLUDE_RULES) if (rule.match.test(name)) return rule.classification;

	const subcommitteePart = name.includes(" - ") ? name.split(" - ").slice(1).join(" - ") : null;
	if (subcommitteePart) {
		for (const rule of SUBCOMMITTEE_RULES) if (rule.match.test(subcommitteePart)) return rule.classification;
	}

	for (const rule of PARENT_RULES) if (rule.match.test(name)) return rule.classification;

	return null;
}
