#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const APOLLO_ADDRESS = process.env.APOLLO_ADDRESS;

if (!APOLLO_ADDRESS) {
  console.error("APOLLO_ADDRESS environment variable is required. Example: http://apollo-domian.com:1080");
  process.exit(1);
}

const metaServerUrl = APOLLO_ADDRESS.replace(/\/+$/, "");

const server = new McpServer({
  name: "mcp-server-apollo",
  version: "1.0.0",
});

// Cache for discovered config service URLs per appId
const configServiceCache = {};

// Discover config service URL from meta server for a given appId
async function discoverConfigService(appId) {
  if (configServiceCache[appId]) {
    return configServiceCache[appId];
  }
  const url = `${metaServerUrl}/services/config?appId=${appId}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    // If discovery fails, fall back to using meta server address directly
    return metaServerUrl;
  }
  const services = await resp.json();
  if (services && services.length > 0) {
    const serviceUrl = services[0].homepageUrl.replace(/\/+$/, "");
    configServiceCache[appId] = serviceUrl;
    return serviceUrl;
  }
  return metaServerUrl;
}

async function apolloGet(path, queryParams = {}, appId) {
  const configServiceUrl = await discoverConfigService(appId);
  let url = `${configServiceUrl}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, value);
    }
  }
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const resp = await fetch(url);

  if (resp.status === 304) {
    return { message: "Configuration has not changed (304 Not Modified)" };
  }
  if (resp.status === 404) {
    return { error: `Namespace not found or not released. Please check appId, namespaceName and ensure the namespace has been published. Path: ${path}` };
  }
  if (resp.status === 401) {
    return { error: "Unauthorized. Access key may be required for this application." };
  }
  if (!resp.ok) {
    return { error: `Apollo API error ${resp.status}: ${await resp.text()}` };
  }

  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await resp.json();
  }
  return { content: await resp.text() };
}

// Tool 1: Get config with full metadata (non-cached, from DB)
server.tool(
  "apollo_get_config",
  "Get Apollo configuration with full metadata (appId, cluster, namespaceName, configurations map, releaseKey). Reads from database directly, suitable for one-time config fetch.",
  {
    appId: z.string().describe("Apollo application ID"),
    clusterName: z.string().default("default").describe("Cluster name, usually 'default'"),
    namespaceName: z.string().default("application").describe("Namespace name. For properties type use name like 'application'. For other types add suffix like 'datasources.json'"),
    ip: z.string().optional().describe("Client IP for gray release matching (optional)"),
  },
  async ({ appId, clusterName, namespaceName, ip }) => {
    const data = await apolloGet(`/configs/${appId}/${clusterName}/${namespaceName}`, { ip }, appId);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 2: Get cached config in JSON format
server.tool(
  "apollo_get_config_json",
  "Get Apollo configuration as JSON key-value pairs (cached, fast response). Suitable for frequent config polling.",
  {
    appId: z.string().describe("Apollo application ID"),
    clusterName: z.string().default("default").describe("Cluster name, usually 'default'"),
    namespaceName: z.string().default("application").describe("Namespace name. For properties type use name like 'application'. For other types add suffix like 'datasources.json'"),
    ip: z.string().optional().describe("Client IP for gray release matching (optional)"),
  },
  async ({ appId, clusterName, namespaceName, ip }) => {
    const data = await apolloGet(`/configfiles/json/${appId}/${clusterName}/${namespaceName}`, { ip }, appId);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 3: Get raw config content
server.tool(
  "apollo_get_config_raw",
  "Get Apollo raw configuration content without escaping. Returns the original config file content.",
  {
    appId: z.string().describe("Apollo application ID"),
    clusterName: z.string().default("default").describe("Cluster name, usually 'default'"),
    namespaceName: z.string().default("application").describe("Namespace name"),
    ip: z.string().optional().describe("Client IP for gray release matching (optional)"),
  },
  async ({ appId, clusterName, namespaceName, ip }) => {
    const data = await apolloGet(`/configfiles/raw/${appId}/${clusterName}/${namespaceName}`, { ip }, appId);
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

// Tool 4: Get config in properties format
server.tool(
  "apollo_get_config_properties",
  "Get Apollo configuration in properties format (key=value lines). Returns plain text properties content.",
  {
    appId: z.string().describe("Apollo application ID"),
    clusterName: z.string().default("default").describe("Cluster name, usually 'default'"),
    namespaceName: z.string().default("application").describe("Namespace name"),
    ip: z.string().optional().describe("Client IP for gray release matching (optional)"),
  },
  async ({ appId, clusterName, namespaceName, ip }) => {
    const data = await apolloGet(`/configfiles/${appId}/${clusterName}/${namespaceName}`, { ip }, appId);
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
