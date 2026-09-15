// Filled pill using the jurisdiction colors from docs/design.md - always paired
// with a two-letter code, never color alone (accessibility floor, design.md).
const COLORS: Record<string, string> = {
	UK: "bg-jurisdiction-uk",
	US: "bg-jurisdiction-us",
	EU: "bg-jurisdiction-eu",
	AU: "bg-jurisdiction-au",
};

export default function JurisdictionTag({ country }: { country: string }) {
	const colorClass = COLORS[country] ?? "bg-ink";

	return (
		<span
			className={`inline-block rounded-bench px-2 py-0.5 text-xs font-mono text-paper ${colorClass}`}
		>
			{country}
		</span>
	);
}
