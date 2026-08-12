export function nameSlug(member: { first: string; last: string }): string {
	return `${member.first}-${member.last}`
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}
