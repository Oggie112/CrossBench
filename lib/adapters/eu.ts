import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import type { ParsedDisclosure, RawDocument, SourceAdapter } from "./source-adapter";

const ZIP_URL =
	"https://commission.europa.eu/document/download/56140a17-d787-4fb1-b374-63b57e9d72f0_en?filename=Machine-Readable-DOIs.zip";
const SHARES_ANCHOR = "III.A.1";
const SHARES_CONFIRM_WINDOW = 50;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });

interface EuRawContent {
	xml: string;
	commissionerSlug: string;
}

function commissionerSlug(entryName: string): string {
	const base = entryName
		.split("/")
		.pop()!
		.replace(/^DOI-/, "")
		.replace(/-EN(\s\(\d+\))?\.xml$/i, "");
	return base
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function flattenWithOffsets(xml: string): { text: string; offsets: number[] } {
	const textChars: string[] = [];
	const offsets: number[] = [];
	const runRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
	let match: RegExpExecArray | null;
	while ((match = runRegex.exec(xml)) !== null) {
		const runText = match[1];
		const runStart = match.index + match[0].indexOf(">") + 1;
		for (let i = 0; i < runText.length; i++) {
			textChars.push(runText[i]);
			offsets.push(runStart + i);
		}
	}
	return { text: textChars.join(""), offsets };
}

// Assumes tables in this form template never nest - true for this fixed
// Code of Conduct form, not a general OOXML guarantee.
function extractSharesTable(xml: string): string | null {
	const { text, offsets } = flattenWithOffsets(xml);
	const anchorIndex = text.indexOf(SHARES_ANCHOR);
	if (anchorIndex === -1) return null;

	const confirmWindow = text.slice(
		anchorIndex + SHARES_ANCHOR.length,
		anchorIndex + SHARES_ANCHOR.length + SHARES_CONFIRM_WINDOW,
	);
	if (!confirmWindow.includes("Shares")) return null;

	const rawOffset = offsets[anchorIndex];
	const tableStart = xml.indexOf("<w:tbl>", rawOffset);
	if (tableStart === -1) return null;

	const tableEnd = xml.indexOf("</w:tbl>", tableStart);
	if (tableEnd === -1) return null;

	return xml.slice(tableStart, tableEnd + "</w:tbl>".length);
}

// Word wraps each row and each cell of this form's tables in nested
// "repeating section" content controls (w:sdt > w:sdtContent > ...), several
// layers deep and not necessarily consistent in depth. Rather than hardcode
// the nesting, search for tags at any depth and stop descending once found.
function findAllDeep(node: unknown, tagName: string): unknown[] {
	const results: unknown[] = [];
	function walk(n: unknown) {
		if (!n || typeof n !== "object") return;
		if (Array.isArray(n)) {
			for (const item of n) walk(item);
			return;
		}
		for (const [key, value] of Object.entries(n as Record<string, unknown>)) {
			if (key === tagName) {
				if (Array.isArray(value)) results.push(...value);
				else results.push(value);
			} else {
				walk(value);
			}
		}
	}
	walk(node);
	return results;
}

interface TextNodeWithAttrs {
	"#text": string | number | boolean;
}

function hasText(value: unknown): value is TextNodeWithAttrs {
	return typeof value === "object" && value !== null && "#text" in value;
}

function cellText(cell: unknown): string {
	const textNodes = findAllDeep(cell, "w:t");
	return textNodes
		.map((t) => {
			if (typeof t === "string") return t;
			if (hasText(t)) return String(t["#text"]);
			return "";
		})
		.join(" ")
		.trim();
}

interface ShareRow {
	entity: string;
	totalValue: string;
	currency: string;
}

function parseShareRows(tableXml: string): ShareRow[] {
	const wrapped = `<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${tableXml}</root>`;
	const doc = xmlParser.parse(wrapped);
	const table: unknown = doc.root["w:tbl"];
	const rows = findAllDeep(table, "w:tr");

	const results: ShareRow[] = [];
	for (const row of rows) {
		const cells = findAllDeep(row, "w:tc");
		const values = cells.map(cellText);
		if (values.length < 4) continue;

		const [entity, , totalValue, currency] = values;
		if (!entity || entity === "Entity concerned") continue;
		if (entity.toUpperCase().includes("NOT APPLICABLE")) continue;

		results.push({ entity, totalValue, currency });
	}
	return results;
}

// EU figures use period as decimal separator and space as thousands
// separator in every verified example (e.g. "131.04", "1 902 972") - no
// comma-decimal convention observed, but not exhaustively confirmed.
function parseAmount(raw: string): number | null {
	const cleaned = raw.replace(/[^\d.-]/g, "");
	const value = Number(cleaned);
	return Number.isFinite(value) ? value : null;
}

export const euAdapter: SourceAdapter = {
	sourceName: "eu_commission_doi",
	country: "EU",

	async fetch(): Promise<RawDocument[]> {
		const response = await fetch(ZIP_URL);
		if (!response.ok) {
			throw new Error(`EU DOI ZIP fetch failed: ${response.status} ${response.statusText}`);
		}

		const lastModifiedHeader = response.headers.get("last-modified");
		const snapshotDate = lastModifiedHeader
			? new Date(lastModifiedHeader).toISOString().slice(0, 10)
			: new Date().toISOString().slice(0, 10);

		const buffer = await response.arrayBuffer();
		const zip = await JSZip.loadAsync(buffer);

		const documents: RawDocument[] = [];
		for (const [entryName, entry] of Object.entries(zip.files)) {
			if (entry.dir) continue;
			if (!/-EN(\s\(\d+\))?\.xml$/i.test(entryName)) continue;
			if (entryName.includes("Test Form")) continue;

			const xml = await entry.async("string");
			const slug = commissionerSlug(entryName);
			const content: EuRawContent = { xml, commissionerSlug: slug };

			documents.push({
				sourceName: "eu_commission_doi",
				sourceRef: `${slug}_${snapshotDate}`,
				country: "EU",
				content,
			});
		}

		return documents;
	},

	async parse(document: RawDocument): Promise<ParsedDisclosure[]> {
		const { xml, commissionerSlug: officialExternalId } = document.content as EuRawContent;

		const tableXml = extractSharesTable(xml);
		if (!tableXml) return [];

		const rows = parseShareRows(tableXml);

		const disclosures: ParsedDisclosure[] = [];
		for (const row of rows) {
			const value = parseAmount(row.totalValue);
			if (value === null) continue;

			disclosures.push({
				officialExternalId,
				rawSecurityText: row.entity,
				country: "EU",
				disclosureType: "holding_snapshot",
				instrumentType: "equity",
				amountMin: value,
				amountMax: value,
				currency: row.currency || undefined,
				confidence: "high",
			});
		}

		return disclosures;
	},
};
