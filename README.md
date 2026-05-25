# @showyouself/mcp-server-apollo

MCP Server for querying [Apollo](https://www.apolloconfig.com/) configuration center. Read-only, no token required.

Based on Apollo's client-side HTTP API documented at [other-language-client-user-guide](https://github.com/apolloconfig/apollo/blob/master/docs/zh/client/other-language-client-user-guide.md).

## Features

- Auto-discovery of Config Service via Meta Server — just provide one address, no need to know Config Service internals
- 4 query tools covering all Apollo client API formats (JSON, raw, properties, full metadata)
- No OpenAPI token or access key required (uses Config Service client API)
- Cached Config Service URL per appId for performance

## Install

### Via npm (after publishing)

```bash
claude mcp add -s -user mcp_server_apollo \
  -s user \
  -e apollo_address="http://your-apollo-meta-server:1080" \
  -- npx @showyouself/mcp-server-apollo
```

### Via local path (for development/testing)

```bash
claude mcp add -s -user mcp_server_apollo \
  -s user \
  -e apollo_address="http://your-apollo-meta-server:1080" \
  -- node /path/to/mcp-server-apollo/index.js
```

### Windows (PowerShell)

```powershell
claude mcp add mcp_server_apollo_sit -s user -- npx @showyouself/mcp-server-apollo --env apollo_address=http://your-apollo-meta-server:1080
```
## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APOLLO_ADDRESS` or `apollo_address` | Yes | Apollo Meta Server address. Can be the Eureka/Meta Server URL (e.g. `http://apollo-sit.xxx:1080`) or a direct Config Service URL (e.g. `http://apollo-config.xxx:8080`). The server auto-discovers Config Service from Meta Server. |

> Note: Environment variable names are case-insensitive — both `APOLLO_ADDRESS` and `apollo_address` work.

## Tools

### 1. `apollo_get_config`

Get Apollo configuration with full metadata — appId, cluster, namespaceName, configurations map, and releaseKey. Reads from database directly (non-cached), suitable for one-time config fetch.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `appId` | string | *(required)* | Apollo application ID |
| `clusterName` | string | `default` | Cluster name |
| `namespaceName` | string | `application` | Namespace name. For properties type: `application`. For other types add suffix: `datasources.json` |
| `ip` | string | *(optional)* | Client IP for gray release matching |

**Response example:**

```json
{
  "appId": "my-app",
  "cluster": "default",
  "namespaceName": "application",
  "configurations": {
    "server.port": "8080",
    "spring.datasource.url": "jdbc:mysql://localhost:3306/db"
  },
  "releaseKey": "20260523135542-abc123"
}
```

### 2. `apollo_get_config_json`

Get Apollo configuration as JSON key-value pairs (cached, fast response). Suitable for frequent config polling.

**Parameters:** Same as `apollo_get_config`.

**Response example:**

```json
{
  "server.port": "8080",
  "spring.datasource.url": "jdbc:mysql://localhost:3306/db"
}
```

### 3. `apollo_get_config_raw`

Get Apollo raw configuration content without escaping. Returns the original config file content.

**Parameters:** Same as `apollo_get_config`.

**Response:** Plain text content of the namespace configuration file.

### 4. `apollo_get_config_properties`

Get Apollo configuration in properties format (`key=value` lines). Returns plain text properties content.

**Parameters:** Same as `apollo_get_config`.

**Response:**

```
server.port=8080
spring.datasource.url=jdbc:mysql://localhost:3306/db
```

## How It Works

Apollo's architecture separates services into Meta Server (Eureka), Config Service, and Admin Service. This MCP server:

1. Takes the Meta Server address as input
2. For each query, calls `/services/config?appId={appId}` on the Meta Server to discover the Config Service URL
3. Caches the discovered Config Service URL per appId
4. Uses the Config Service URL to call the client API endpoints (`/configs/...`, `/configfiles/...`)

If the Meta Server discovery fails (e.g., the address is already a Config Service URL), it falls back to using the provided address directly.

## Error Handling

| HTTP Status | Meaning |
|-------------|---------|
| 404 | Namespace not found or not released — check appId/namespaceName and ensure it has been published |
| 401 | Unauthorized — access key may be required for this application |
| 304 | Configuration unchanged (only for `apollo_get_config` with releaseKey comparison) |

## Apollo Namespace Name Convention

- **Properties type**: Use the namespace name directly, e.g. `application`
- **JSON/XML/YAML type**: Append the format suffix, e.g. `datasources.json`, `rocketmq.xml`, `logging.yml`

## Requirements

- Node.js >= 18.0.0 (for native `fetch` support)

## Publish to npm

```bash
cd /path/to/mcp-server-apollo
npm publish --access public
```

## License

MIT