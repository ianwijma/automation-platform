# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: data-preview.spec.ts >> Data Inspection >> UI: data preview shows when clicking node execution
- Location: e2e/tests/data-preview.spec.ts:96:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=Data Preview UI Test').first()

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
      - generic [ref=e27]: Runs
      - generic [ref=e28]: No runs yet
  - contentinfo [ref=e30]:
    - generic [ref=e31]:
      - generic [ref=e32]: v0.1.0
      - generic [ref=e33]: "Uptime: 0m"
    - generic [ref=e34]:
      - button "AI Chat" [ref=e35]
      - button "Settings" [ref=e38]
```

# Test source

```ts
  8   |     {
  9   |       id: "n1",
  10  |       type: "trigger.manual",
  11  |       typeVersion: 1,
  12  |       name: "Start",
  13  |       target: { kind: "local" },
  14  |       params: {},
  15  |       disabled: false,
  16  |       position: { x: 0, y: 0 },
  17  |     },
  18  |     {
  19  |       id: "n2",
  20  |       type: "system.command",
  21  |       typeVersion: 1,
  22  |       name: "Echo",
  23  |       target: { kind: "local" },
  24  |       params: { command: "echo data-preview-output" },
  25  |       disabled: false,
  26  |       position: { x: 200, y: 0 },
  27  |     },
  28  |   ],
  29  |   edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
  30  | };
  31  | 
  32  | test.describe("Data Inspection", () => {
  33  |   test("GET /api/runs/:id returns node executions with input/output", async ({ request, testServer }) => {
  34  |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  35  |       data: { name: "Data Preview Test", definition: MANUAL_DEFINITION },
  36  |     });
  37  |     const automation = await createResp.json();
  38  | 
  39  |     const runResp = await request.post(`${testServer.url}/api/automations/${automation.id}/run`, {
  40  |       data: { mode: "manual" },
  41  |     });
  42  |     expect([201, 200]).toContain(runResp.status());
  43  |     const run = await runResp.json();
  44  | 
  45  |     const detailResp = await request.get(`${testServer.url}/api/runs/${run.id}`);
  46  |     expect(detailResp.ok()).toBeTruthy();
  47  |     const detail = await detailResp.json();
  48  | 
  49  |     expect(detail).toHaveProperty("nodeExecutions");
  50  |     expect(Array.isArray(detail.nodeExecutions)).toBeTruthy();
  51  |   });
  52  | 
  53  |   test("run with output has non-empty node execution data", async ({ request, testServer }) => {
  54  |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  55  |       data: { name: "Output Test", definition: MANUAL_DEFINITION },
  56  |     });
  57  |     const automation = await createResp.json();
  58  | 
  59  |     const runResp = await request.post(`${testServer.url}/api/automations/${automation.id}/run`, {
  60  |       data: {},
  61  |     });
  62  |     const run = await runResp.json();
  63  | 
  64  |     const detailResp = await request.get(`${testServer.url}/api/runs/${run.id}`);
  65  |     const detail = await detailResp.json();
  66  | 
  67  |     if (detail.nodeExecutions.length > 0) {
  68  |       const exec = detail.nodeExecutions[0];
  69  |       expect(exec).toHaveProperty("nodeId");
  70  |       expect(exec).toHaveProperty("status");
  71  |       expect(exec).toHaveProperty("input");
  72  |       expect(exec).toHaveProperty("output");
  73  |     }
  74  |   });
  75  | 
  76  |   test("UI: click on a run shows node execution list", async ({ page, testServer }) => {
  77  |     await page.goto(testServer.url);
  78  |     await page.waitForSelector("text=Automation Platform");
  79  | 
  80  |     const createResp = await page.request.post(`${testServer.url}/api/automations`, {
  81  |       data: { name: "UI Run Test", definition: MANUAL_DEFINITION },
  82  |     });
  83  |     const automation = await createResp.json();
  84  | 
  85  |     await page.request.post(`${testServer.url}/api/automations/${automation.id}/run`, {});
  86  | 
  87  |     const autoItem = page.locator("text=UI Run Test").first();
  88  |     await autoItem.click();
  89  | 
  90  |     await page.waitForTimeout(1000);
  91  | 
  92  |     const runSection = page.locator("text=Runs").first();
  93  |     await expect(runSection).toBeVisible();
  94  |   });
  95  | 
  96  |   test("UI: data preview shows when clicking node execution", async ({ page, testServer }) => {
  97  |     await page.goto(testServer.url);
  98  |     await page.waitForSelector("text=Automation Platform");
  99  | 
  100 |     const createResp = await page.request.post(`${testServer.url}/api/automations`, {
  101 |       data: { name: "Data Preview UI Test", definition: MANUAL_DEFINITION },
  102 |     });
  103 |     const automation = await createResp.json();
  104 | 
  105 |     await page.request.post(`${testServer.url}/api/automations/${automation.id}/run`, {});
  106 | 
  107 |     const autoItem = page.locator("text=Data Preview UI Test").first();
> 108 |     await autoItem.click();
      |                    ^ Error: locator.click: Test timeout of 30000ms exceeded.
  109 | 
  110 |     await page.waitForTimeout(1500);
  111 | 
  112 |     const nodeExecHeader = page.locator("text=Node Executions").first();
  113 |     await expect(nodeExecHeader).toBeVisible({ timeout: 5000 });
  114 | 
  115 |     const nodeRow = page.locator("[class*='text-gray-300']").first();
  116 |     if (await nodeRow.isVisible()) {
  117 |       await nodeRow.click();
  118 |       await expect(page.locator("text=Data Preview").first()).toBeVisible({ timeout: 3000 });
  119 |     }
  120 |   });
  121 | });
  122 | 
```