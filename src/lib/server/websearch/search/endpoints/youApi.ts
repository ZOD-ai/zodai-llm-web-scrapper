import { env } from "@env";
import { isURL } from "@lib/utils/isUrl";
import type { WebSearchSource } from "@lib/types/WebSearch";

interface YouWebSearch {
	hits: YouSearchHit[];
	latency: number;
}

interface YouSearchHit {
	url: string;
	title: string;
	description: string;
	snippets: string[];
}

export default async function searchWebYouApi(query: string): Promise<WebSearchSource[]> {
	const youApiKey = env.YDC_API_KEY ?? "";
	if (!youApiKey) {
		throw new Error("YDC_API_KEY is not set");
	}

	const response = await fetch(`https://api.ydc-index.io/search?query=${query}`, {
		method: "GET",
		headers: {
			"X-API-Key": youApiKey,
			"Content-type": "application/json; charset=UTF-8",
		},
	});

	if (!response.ok) {
		throw new Error(`You.com API returned error code ${response.status} - ${response.statusText}`);
	}

	const data = (await response.json()) as YouWebSearch;
	const formattedResultsWithSnippets = data.hits
		.filter(({ url }) => isURL(url))
		.map(({ title, url, snippets }) => ({
			title,
			link: url,
			text: snippets?.join("\n") || "",
		}))
		.sort((a, b) => b.text.length - a.text.length); // desc order by text length

	return formattedResultsWithSnippets;
}
