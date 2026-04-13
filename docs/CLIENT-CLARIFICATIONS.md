# Client Clarifications

Discovery questions to cover during the introductory call. Answers to these questions will shape deployment configuration, tool prioritization, and the Section 2 (GHL sync) implementation plan.

## Shopmonkey Account

1. **Shopmonkey tier** — Which plan are you on (Standard, Premium, or Enterprise)? This determines whether Data Streaming and certain advanced API features are available.

2. **API key generation** — Can you generate a long-lived API key from Shopmonkey Settings > Integration > API Keys? This requires specific user role permissions (typically shop owner or admin).

3. **Single vs. multi-location** — Do you operate one shop location or multiple? Multi-location shops can use `SHOPMONKEY_LOCATION_ID` to scope all queries to a single location, or leave it unset to query across locations.

## Workflow & Usage

4. **Canned service patterns** — Walk me through how you currently use canned services. Do you use fixed-price or line-item pricing? How often do you update templates? This shapes which of the 22 service tools to prioritize in the demo.

5. **Report views** — Which of these built-in reports would be most useful for your day-to-day?
   - Revenue summary (by status and paid/unpaid split)
   - Appointment summary (by confirmation status)
   - Open estimates (unauthorized estimates with aging)
   - Or something else entirely?

6. **Destructive operation policy** — Should the AI agent be able to delete canned services or webhooks without confirmation, or should we build in a confirmation step? How do you feel about the agent creating/modifying orders directly?

7. **Status workflow** — What's your typical order lifecycle? (e.g., Estimate → RepairOrder → Invoice → Paid) Do you use custom workflow statuses?

## Deployment & Infrastructure

8. **Doppler familiarity** — We use [Doppler](https://doppler.com) for secrets management (API keys, auth tokens). Have you used it before, or would you prefer environment variables set directly in the hosting platform?

9. **Railway experience** — The MCP server deploys to [Railway](https://railway.app) for cloud access (e.g., connecting to Claude.ai). Have you used Railway or similar platforms (Render, Fly.io)?

10. **Custom domain** — Do you want the MCP server accessible at a custom domain (e.g., `mcp.yourshop.com`), or is the default Railway URL sufficient?

## Project Scope & Priorities

11. **Section 1 vs. Section 2 priority** — The MCP server (Section 1: 64 shop data tools) is ready to deploy now. The GHL sync (Section 2: webhook → Make.com → GoHighLevel) requires additional Make.com scenario configuration. Which is the higher priority to get running first?

12. **Existing Make.com setup** — Do you already have a Make.com account? Any existing scenarios connecting Shopmonkey to other systems?

13. **Timeline expectations** — When would you like the MCP server live and connected to Claude? Is there a specific milestone or date you're working toward?

14. **AI client preference** — Which AI client(s) do you plan to use?
    - Claude Desktop (local, free)
    - Claude.ai (web, requires HTTP deployment)
    - Cursor (IDE integration)
    - Claude Code (CLI)

## Next Steps After Call

Based on the answers above, the immediate next steps are typically:

1. Client generates a Shopmonkey API key and shares it securely
2. We deploy the MCP server to Railway (takes ~15 minutes)
3. We configure the client's preferred AI client to connect
4. We run a live smoke test against real shop data
5. We scope the Section 2 (GHL sync) timeline if applicable
