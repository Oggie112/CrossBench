export function slugifyWord(word: string): string {
	return word
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

export function nameSlug(member: { first: string; last: string }): string {
	return `${slugifyWord(member.first)}-${slugifyWord(member.last)}`;
}
