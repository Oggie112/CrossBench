const LABELS: Record<string, string> = {
	option_call: "▲ Call",
	option_put: "▼ Put",
	equity: "Equity",
	bond: "Bond",
	other: "Other",
};

export default function InstrumentBadge({ instrumentType }: { instrumentType: string | null }) {
	const label = instrumentType ? (LABELS[instrumentType] ?? instrumentType) : "—";

	return (
		<span className="inline-block rounded-bench border border-brass/60 px-2 py-0.5 text-xs font-mono text-ink">
			{label}
		</span>
	);
}