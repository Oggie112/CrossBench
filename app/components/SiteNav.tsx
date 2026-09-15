import Link from "next/link";

export default function SiteNav() {
	return (
		<header className="border-b border-brass/40 px-8 py-4">
			<nav className="flex items-center justify-between font-sans">
				<Link href="/" className="font-display text-lg font-semibold tracking-tight text-ink">
					CrossBench
				</Link>
				<div className="flex gap-6 text-sm text-ink">
					<Link href="/us">US</Link>
					<Link href="/global">Global</Link>
					<Link href="/about">About</Link>
				</div>
			</nav>
		</header>
	);
}
