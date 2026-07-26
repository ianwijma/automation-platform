# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ai-panel.spec.ts >> AI Assistant >> AI panel sends message and shows error without real key
- Location: e2e/tests/ai-panel.spec.ts:60:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=AI Assistant')
Expected: visible
Error: strict mode violation: locator('text=AI Assistant') resolved to 2 elements:
    1) <span class="text-xs font-semibold text-gray-200">AI Assistant</span> aka getByText('AI Assistant', { exact: true })
    2) <p class="text-center text-xs text-gray-600">…</p> aka getByText('Ask the AI assistant to help')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=AI Assistant')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: AP
      - generic [ref=e7]: Automation Platform
    - generic [ref=e8]: standalone
  - generic [ref=e10]:
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: Automations
        - button "New" [ref=e15]
      - generic [ref=e17]: No automations yet
    - generic [ref=e21]:
      - generic [ref=e22]: ⚡
      - heading "Automation Platform" [level=2] [ref=e23]
      - paragraph [ref=e24]: Create or select an automation to get started
    - generic [ref=e26]:
      - generic [ref=e27]:
        - generic [ref=e28]: AI Assistant
        - button "Close" [ref=e32]
      - paragraph [ref=e35]: Ask the AI assistant to help build your automation.It can add nodes, modify parameters, and suggest changes.
      - generic [ref=e37]:
        - textbox "Ask the AI assistant..." [ref=e38]
        - button [disabled] [ref=e39]
  - contentinfo [ref=e43]:
    - generic [ref=e44]:
      - generic [ref=e45]: v0.1.0
      - generic [ref=e46]: "Uptime: 0m"
    - generic [ref=e47]:
      - button "AI Chat" [active] [ref=e48]
      - button "Settings" [ref=e51]
```

# Test source

```ts
  1  | import { test, expect } from "../fixtures/base.js";
  2  | 
  3  | test.describe("AI Assistant", () => {
  4  |   test("POST /api/ai/chat with no API key returns 400", async ({ request, testServer }) => {
  5  |     await request.put(`${testServer.url}/api/settings`, {
  6  |       data: { aiApiKey: "" },
  7  |     });
  8  | 
  9  |     const resp = await request.post(`${testServer.url}/api/ai/chat`, {
  10 |       data: { messages: [{ role: "user", content: "hello" }] },
  11 |     });
  12 |     expect(resp.status()).toBe(400);
  13 |     const body = await resp.json();
  14 |     expect(body.error).toContain("API key");
  15 |   });
  16 | 
  17 |   test("POST /api/ai/apply with non-existent automation returns 404", async ({ request, testServer }) => {
  18 |     const resp = await request.post(`${testServer.url}/api/ai/apply`, {
  19 |       data: {
  20 |         automationId: "00000000-0000-0000-0000-000000000000",
  21 |         diffs: [{ op: "add-node", path: "/nodes", value: {}, description: "test" }],
  22 |       },
  23 |     });
  24 |     expect(resp.status()).toBe(404);
  25 |   });
  26 | 
  27 |   test("GET /api/ai/models with no API key returns 400", async ({ request, testServer }) => {
  28 |     await request.put(`${testServer.url}/api/settings`, {
  29 |       data: { aiApiKey: "" },
  30 |     });
  31 | 
  32 |     const resp = await request.get(`${testServer.url}/api/ai/models`);
  33 |     expect(resp.status()).toBe(400);
  34 |     const body = await resp.json();
  35 |     expect(body.error).toContain("API key");
  36 |   });
  37 | 
  38 |   test("AI chat with API key set still works (may fail on endpoint)", async ({ request, testServer }) => {
  39 |     await request.put(`${testServer.url}/api/settings`, {
  40 |       data: { aiApiKey: "sk-test-key-123", aiModel: "openai/gpt-4o-mini" },
  41 |     });
  42 | 
  43 |     const resp = await request.post(`${testServer.url}/api/ai/chat`, {
  44 |       data: { messages: [{ role: "user", content: "hello" }] },
  45 |     });
  46 |     expect([200, 500]).toContain(resp.status());
  47 |   });
  48 | 
  49 |   test("AI panel opens in UI and shows chat input", async ({ page, testServer }) => {
  50 |     await page.goto(testServer.url);
  51 |     await page.waitForSelector("text=Automation Platform");
  52 | 
  53 |     const aiButton = page.locator("button:has-text('AI')");
  54 |     await aiButton.click();
  55 | 
  56 |     await expect(page.locator("text=AI Assistant")).toBeVisible();
  57 |     await expect(page.locator('input[placeholder="Ask the AI assistant..."]')).toBeVisible();
  58 |   });
  59 | 
  60 |   test("AI panel sends message and shows error without real key", async ({ page, request, testServer }) => {
  61 |     await page.goto(testServer.url);
  62 |     await page.waitForSelector("text=Automation Platform");
  63 | 
  64 |     await request.put(`${testServer.url}/api/settings`, {
  65 |       data: { aiApiKey: "" },
  66 |     });
  67 | 
  68 |     const aiButton = page.locator("button:has-text('AI')");
  69 |     await aiButton.click();
> 70 |     await expect(page.locator("text=AI Assistant")).toBeVisible();
     |                                                     ^ Error: expect(locator).toBeVisible() failed
  71 | 
  72 |     const input = page.locator('input[placeholder="Ask the AI assistant..."]');
  73 |     await input.fill("test message");
  74 |     await input.press("Enter");
  75 | 
  76 |     await expect(page.locator("text=API key")).toBeVisible({ timeout: 5000 });
  77 |   });
  78 | });
  79 | 
```