---
title: BuyWhere Agent Example
summary: Use BuyWhere's MCP server to add product search, deals, and price comparison to your Paperclip agent
---

This guide shows how to configure a Paperclip agent to use [BuyWhere](https://buywhere.ai), an MCP server that provides real-time product search and price comparison across Singapore, Southeast Asia, and the US.

## What BuyWhere Provides

BuyWhere exposes an MCP server with 8 tools over one JSON-RPC endpoint:

| Tool | Description |
|------|-------------|
| `search_products` | Full-text search across Shopee, Lazada, Amazon SG, Amazon US, Walmart, and 20+ more platforms |
| `lookup_product` | Get detailed product info by URL or ID |
| `compare_prices` | Compare prices for the same product across multiple retailers |
| `get_deals` | Products with the biggest current discounts |
| `price_history` | Historical price chart for a product |
| `list_categories` | Browse available product categories |
| `subscribe_price_alert` | Monitor price drops on specific products |
| `list_merchants` | See all retailers indexed by BuyWhere |

## Prerequisites

- A Paperclip company with at least one agent configured
- A BuyWhere API key ([get one free](https://buywhere.ai) — free tier: 1,000 calls/month)

## Setup

### 1. Install the BuyWhere MCP Server

In your agent's execution environment, install the BuyWhere MCP server:

```sh
npm install -g @buywhere/mcp-server
# or
npx @buywhere/mcp-server --help
```

### 2. Configure Your Paperclip Agent

Set these environment variables on your agent (via the Paperclip UI → Agent → Settings → Environment, or via the API):

```env
BUYWHERE_API_KEY=bw_live_your_api_key_here
```

### 3. Connect via MCP (if your adapter supports MCP)

If your adapter supports MCP servers natively (e.g., Claude Code with MCP configured), add this to your `mcp_servers.json`:

```json
{
  "mcpServers": {
    "buywhere": {
      "command": "npx",
      "args": ["-y", "@buywhere/mcp-server"],
      "env": {
        "BUYWHERE_API_KEY": "${BUYWHERE_API_KEY}"
      }
    }
  }
}
```

### 4. Or Use the HTTP Endpoint Directly

Paperclip agents can call the BuyWhere HTTP API directly without MCP:

```typescript
const response = await fetch("https://api.buywhere.ai/mcp", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.BUYWHERE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "search_products",
      arguments: { query: "wireless headphones singapore", limit: 10 }
    }
  })
});
const data = await response.json();
```

## Example: Product Research Agent

Here's a complete agent instruction set for a product research agent that uses BuyWhere:

```
You are a product research agent. When given a product category or specific product,
use the BuyWhere tools to:

1. Search for the product across multiple retailers
2. Compare prices to find the best deal
3. Check current discount/deal listings
4. Look up historical pricing to identify if now is a good time to buy
5. Report your findings in a structured format

Always cite the specific retailer and price for each finding. Flag any products
with unusual price swings or especially good deals.

When searching:
- Use search_products for general queries
- Use get_deals when asked about discounts or "best deals"
- Use compare_prices when you have a specific product URL or model
- Use price_history when checking if a price is good or inflated

Format your final report as:
- Summary table: product | best price | retailer | deal %
- Top 3 picks with reasoning
- Any price alerts worth setting
```

## Example: Shopping Assistant Skill

You can package BuyWhere integration as a Paperclip skill:

```typescript
// skills/buywhere-search/SKILL.md
export const description = `Search products across Singapore, SEA, and US retailers`;

// The agent calls these tools via the MCP server or HTTP API:
export const tools = {
  search_products: {
    description: "Full-text product search",
    parameters: {
      query: "string",
      limit: "number (default: 10)",
      region: "sg | sea | us (default: sg)"
    }
  },
  get_deals: {
    description: "Current top discounts",
    parameters: {
      category: "string (optional)",
      limit: "number (default: 10)"
    }
  }
};
```

## Verification

After setup, test that your agent can reach BuyWhere:

```typescript
// In your agent's execution context
const test = await fetch("https://api.buywhere.ai/mcp", {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.BUYWHERE_API_KEY}` },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1,
    method: "tools/call",
    params: { name: "list_categories", arguments: {} }
  })
});
const result = await test.json();
console.log("BuyWhere connected:", result.result?.content?.[0]?.text ?? "OK");
```

Expected output: a JSON list of product categories.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Invalid or missing API key | Set `BUYWHERE_API_KEY` env var |
| `429 Too Many Requests` | Rate limit exceeded | Upgrade plan or add delay between calls |
| `500 Internal Server Error` | BuyWhere API issue | Check status at buywhere.ai and retry |
| `ENOTFOUND api.buywhere.ai` | DNS/network issue | Verify internet connectivity from agent environment |

## See Also

- [BuyWhere MCP Server on npm](https://www.npmjs.com/package/@buywhere/mcp-server)
- [BuyWhere Documentation](https://buywhere.ai/docs)
- [GitHub: BuyWhere/buywhere-mcp](https://github.com/BuyWhere/buywhere-mcp)
- [How Agents Work](/guides/agent-developer/how-agents-work)
- [Writing a Skill](/guides/agent-developer/writing-a-skill)
