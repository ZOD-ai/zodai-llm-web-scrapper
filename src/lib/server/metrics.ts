import { collectDefaultMetrics, Registry, Counter, Summary } from "prom-client";
import express from "express";
import { logger } from "@logger";
import { env } from "@env";
import type { Model } from "@lib/types/Model";
import { onExit } from "./exitHandler";
import { promisify } from "util";

interface Metrics {
	model: {
		conversationsTotal: Counter<Model["id"]>;
		messagesTotal: Counter<Model["id"]>;
		tokenCountTotal: Counter<Model["id"]>;
		timePerOutputToken: Summary<Model["id"]>;
		timeToFirstToken: Summary<Model["id"]>;
		latency: Summary<Model["id"]>;
	};

	webSearch: {
		requestCount: Counter;
		pageFetchCount: Counter;
		pageFetchCountError: Counter;
		pageFetchDuration: Summary;
		embeddingDuration: Summary;
	};

	tool: {
		toolUseCount: Counter<string>;
		toolUseCountError: Counter<string>;
		toolUseDuration: Summary<string>;
		timeToChooseTools: Summary;
	};
}

export class MetricsServer {
	private static instance: MetricsServer;
	private metrics: Metrics;

	private constructor() {
		const app = express();

		const port = Number(env.METRICS_PORT || "5565");
		if (isNaN(port) || port < 0 || port > 65535) {
			logger.warn(`Invalid value for METRICS_PORT: ${env.METRICS_PORT}`);
		}

		if (env.METRICS_ENABLED !== "false" && env.METRICS_ENABLED !== "true") {
			logger.warn(`Invalid value for METRICS_ENABLED: ${env.METRICS_ENABLED}`);
		}
		if (env.METRICS_ENABLED === "true") {
			const server = app.listen(port, () => {
				logger.info(`Metrics server listening on port ${port}`);
			});
			const closeServer = promisify(server.close);
			onExit(async () => {
				logger.info("Disconnecting metrics server ...");
				await closeServer();
				logger.info("Server stopped ...");
			});
		}

		const register = new Registry();
		collectDefaultMetrics({ register });

		this.metrics = {
			model: {
				conversationsTotal: new Counter({
					name: "model_conversations_total",
					help: "Total number of conversations",
					labelNames: ["model"],
					registers: [register],
				}),
				messagesTotal: new Counter({
					name: "model_messages_total",
					help: "Total number of messages",
					labelNames: ["model"],
					registers: [register],
				}),
				tokenCountTotal: new Counter({
					name: "model_token_count_total",
					help: "Total number of tokens",
					labelNames: ["model"],
					registers: [register],
				}),
				timePerOutputToken: new Summary({
					name: "model_time_per_output_token_ms",
					help: "Time per output token in ms",
					labelNames: ["model"],
					registers: [register],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
				timeToFirstToken: new Summary({
					name: "model_time_to_first_token_ms",
					help: "Time to first token",
					labelNames: ["model"],
					registers: [register],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
				latency: new Summary({
					name: "model_latency_ms",
					help: "Total latency until end of answer",
					labelNames: ["model"],
					registers: [register],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
			},
			webSearch: {
				requestCount: new Counter({
					name: "web_search_request_count",
					help: "Total number of web search requests",
					registers: [register],
				}),
				pageFetchCount: new Counter({
					name: "web_search_page_fetch_count",
					help: "Total number of web search page fetches",
					registers: [register],
				}),
				pageFetchCountError: new Counter({
					name: "web_search_page_fetch_count_error",
					help: "Total number of web search page fetch errors",
					registers: [register],
				}),
				pageFetchDuration: new Summary({
					name: "web_search_page_fetch_duration_ms",
					help: "Web search page fetch duration",
					registers: [register],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
				embeddingDuration: new Summary({
					name: "web_search_embedding_duration_ms",
					help: "Web search embedding duration",
					registers: [register],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
			},
			tool: {
				toolUseCount: new Counter({
					name: "tool_use_count",
					help: "Total number of tool uses",
					labelNames: ["tool"],
					registers: [register],
				}),
				toolUseCountError: new Counter({
					name: "tool_use_count_error",
					help: "Total number of tool use errors",
					labelNames: ["tool"],
					registers: [register],
				}),
				toolUseDuration: new Summary({
					name: "tool_use_duration_ms",
					help: "Tool use duration",
					labelNames: ["tool"],
					registers: [register],
					maxAgeSeconds: 30 * 60, // longer duration since we use this to give feedback to the user
					ageBuckets: 5,
				}),
				timeToChooseTools: new Summary({
					name: "time_to_choose_tools_ms",
					help: "Time to choose tools",
					labelNames: ["model"],
					registers: [register],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
			},
		};

		app.get("/metrics", (req, res) => {
			register.metrics().then((metrics) => {
				res.set("Content-Type", "text/plain");
				res.send(metrics);
			});
		});
	}

	public static getInstance(): MetricsServer {
		if (!MetricsServer.instance) {
			MetricsServer.instance = new MetricsServer();
		}

		return MetricsServer.instance;
	}

	public static getMetrics(): Metrics {
		return MetricsServer.getInstance().metrics;
	}
}
