# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: automations.spec.ts >> Automations >> activate toggle in sidebar
- Location: e2e/tests/automations.spec.ts:131:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=UIToggle').first().locator('button svg.lucide-zap-off, button svg.lucide-zap').first()

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
      - generic [ref=e18] [cursor=pointer]:
        - button "Activate" [ref=e19]
        - generic [ref=e25]: UIToggle
    - generic [ref=e28]:
      - generic [ref=e29]: ⚡
      - heading "Automation Platform" [level=2] [ref=e30]
      - paragraph [ref=e31]: Create or select an automation to get started
    - generic [ref=e33]:
      - generic [ref=e34]: Runs
      - generic [ref=e35]: No runs yet
  - contentinfo [ref=e37]:
    - generic [ref=e38]:
      - generic [ref=e39]: v0.1.0
      - generic [ref=e40]: "Uptime: 0m"
    - generic [ref=e41]:
      - button "AI Chat" [ref=e42]
      - button "Settings" [ref=e45]
```

# Test source

```ts
  43  |     expect(body.name).toBe("Single Auto");
  44  |   });
  45  | 
  46  |   test("gets 404 for missing automation", async ({ request, testServer }) => {
  47  |     const resp = await request.get(`${testServer.url}/api/automations/nonexistent-id`);
  48  |     expect(resp.status()).toBe(404);
  49  |   });
  50  | 
  51  |   test("updates an automation", async ({ request, testServer }) => {
  52  |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  53  |       data: { name: "Original", definition: SIMPLE_MANUAL_COMMAND },
  54  |     });
  55  |     const { id } = await createResp.json();
  56  | 
  57  |     const updatedDef = { ...SIMPLE_MANUAL_COMMAND, name: "Updated" };
  58  |     const resp = await request.put(`${testServer.url}/api/automations/${id}`, {
  59  |       data: { definition: updatedDef },
  60  |     });
  61  |     expect(resp.ok()).toBeTruthy();
  62  |     const body = await resp.json();
  63  |     expect(body.draft.name).toBe("Updated");
  64  |   });
  65  | 
  66  |   test("deletes an automation", async ({ request, testServer }) => {
  67  |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  68  |       data: { name: "ToDelete", definition: SIMPLE_MANUAL_COMMAND },
  69  |     });
  70  |     const { id } = await createResp.json();
  71  | 
  72  |     const delResp = await request.delete(`${testServer.url}/api/automations/${id}`);
  73  |     expect(delResp.ok()).toBeTruthy();
  74  |     expect(await delResp.json()).toEqual({ success: true });
  75  | 
  76  |     const getResp = await request.get(`${testServer.url}/api/automations/${id}`);
  77  |     expect(getResp.status()).toBe(404);
  78  |   });
  79  | 
  80  |   test("activates and deactivates an automation", async ({ request, testServer }) => {
  81  |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  82  |       data: { name: "Toggle", definition: SIMPLE_MANUAL_COMMAND },
  83  |     });
  84  |     const { id } = await createResp.json();
  85  | 
  86  |     const activateResp = await request.post(`${testServer.url}/api/automations/${id}/activate`);
  87  |     expect(activateResp.ok()).toBeTruthy();
  88  |     const activated = await activateResp.json();
  89  |     expect(activated.activeVersionId).toBeDefined();
  90  |     expect(activated.activeVersionId).not.toBeNull();
  91  | 
  92  |     const deactivateResp = await request.post(`${testServer.url}/api/automations/${id}/deactivate`);
  93  |     expect(deactivateResp.ok()).toBeTruthy();
  94  |     const deactivated = await deactivateResp.json();
  95  |     expect(deactivated.activeVersionId).toBeNull();
  96  |   });
  97  | 
  98  |   test("creates automation via UI and sees it in sidebar", async ({ page, testServer }) => {
  99  |     await page.goto(testServer.url);
  100 |     await page.waitForSelector("text=Automations");
  101 | 
  102 |     await page.click('button:has-text("New")');
  103 |     await page.fill('input[placeholder="Automation name"]', "UI Created");
  104 |     await page.click('button:has-text("Create")');
  105 | 
  106 |     await page.waitForSelector('text="UI Created"');
  107 |     expect(await page.textContent("body")).toContain("UI Created");
  108 |   });
  109 | 
  110 |   test("delete automation via UI with confirmation", async ({ page, testServer, request }) => {
  111 |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  112 |       data: { name: "UIDelete", definition: SIMPLE_MANUAL_COMMAND },
  113 |     });
  114 |     const { id } = await createResp.json();
  115 | 
  116 |     await page.goto(testServer.url);
  117 |     await page.waitForSelector('text="UIDelete"');
  118 | 
  119 |     page.on("dialog", (dialog) => dialog.accept());
  120 |     const row = page.locator(`text=UIDelete`).first();
  121 |     await row.hover();
  122 |     const deleteBtn = row.locator('button svg.lucide-trash-2').first();
  123 |     await deleteBtn.click();
  124 | 
  125 |     await page.waitForSelector('text="No automations yet"', { timeout: 5000 }).catch(() => {});
  126 | 
  127 |     const verifyResp = await request.get(`${testServer.url}/api/automations/${id}`);
  128 |     expect(verifyResp.status()).toBe(404);
  129 |   });
  130 | 
  131 |   test("activate toggle in sidebar", async ({ page, testServer, request }) => {
  132 |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  133 |       data: { name: "UIToggle", definition: SIMPLE_MANUAL_COMMAND },
  134 |     });
  135 |     const { id } = await createResp.json();
  136 | 
  137 |     await page.goto(testServer.url);
  138 |     await page.waitForSelector('text="UIToggle"');
  139 | 
  140 |     page.on("dialog", (dialog) => dialog.accept());
  141 |     const row = page.locator('text=UIToggle').first();
  142 |     const zapBtn = row.locator('button svg.lucide-zap-off, button svg.lucide-zap').first();
> 143 |     await zapBtn.click();
      |                  ^ Error: locator.click: Test timeout of 30000ms exceeded.
  144 | 
  145 |     await page.waitForTimeout(500);
  146 | 
  147 |     const checkResp = await request.get(`${testServer.url}/api/automations/${id}`);
  148 |     const auto = await checkResp.json();
  149 |     expect(auto.activeVersionId).not.toBeNull();
  150 |   });
  151 | });
  152 | 
```