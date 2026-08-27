import { Fraunces, Source_Serif_4, IBM_Plex_Mono, Inter } from "next/font/google";

// design.md: "variable, optical size high, weight 500-600". next/font only
// loads the wght axis by default for a variable font - opsz has to be
// requested explicitly via `axes`. The generated type for this font only
// accepts "variable" or a list of discrete weights, not a numeric range
// string ("500 600") despite next/font's general docs describing that
// syntax elsewhere - confirmed by the compiler, not assumed. Loading the
// full variable range and constraining to 500-600 via plain CSS
// `font-weight` at point of use instead.
export const fraunces = Fraunces({
	subsets: ["latin"],
	variable: "--font-fraunces",
	weight: "variable",
	axes: ["opsz"],
	display: "swap",
});

export const sourceSerif = Source_Serif_4({
	subsets: ["latin"],
	variable: "--font-source-serif",
	display: "swap",
});

// Confirmed via next/font's own font-data.json before writing this: unlike
// the other three fonts here, IBM Plex Mono has no "variable" weight option
// at all, only fixed static weights - omitting `weight` fails at build time.
export const ibmPlexMono = IBM_Plex_Mono({
	subsets: ["latin"],
	variable: "--font-ibm-plex-mono",
	weight: ["400", "500"],
	display: "swap",
});

export const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});