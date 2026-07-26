# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canvas.spec.ts >> Canvas Visual Editor >> edges from definition render on canvas
- Location: e2e/tests/canvas.spec.ts:56:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('.react-flow__edge') to be visible
    13 × locator resolved to hidden <g tabindex="0" role="group" data-id="e1" data-testid="rf__edge-e1" aria-roledescription="edge" aria-label="Edge from n1 to n2" aria-describedby="react-flow__edge-desc-1" class="react-flow__edge react-flow__edge-smoothstep nopan animated selectable">…</g>

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: AP
      - generic [ref=e7]: Automation Platform
      - generic [ref=e8]: /
      - generic [ref=e9]: Simple Manual Command
      - generic [ref=e10]: unsaved
    - generic [ref=e11]:
      - button "Versions" [ref=e12]
      - button "AI" [ref=e17]
      - button "Dry Run" [ref=e20]
      - button "Save" [ref=e23]
      - button "Run" [ref=e28]
      - generic [ref=e31]: standalone
  - generic [ref=e32]:
    - generic [ref=e34]:
      - generic [ref=e35]:
        - generic [ref=e36]: Automations
        - button "New" [ref=e37]
      - generic [ref=e40] [cursor=pointer]:
        - button "Activate" [ref=e41]
        - generic [ref=e47]: Edges Test
        - button [ref=e48]
    - generic [ref=e55]:
      - generic [ref=e57]:
        - generic [ref=e58]: Node Palette
        - generic [ref=e59]:
          - button "Triggers 4" [ref=e60]:
            - text: Triggers
            - generic [ref=e64]: "4"
          - generic [ref=e65]:
            - generic [ref=e66]: Manual Trigger
            - generic [ref=e73]: Schedule
            - generic [ref=e78]: Webhook
            - generic [ref=e83]: Polling
        - generic [ref=e91]:
          - button "Execution 4" [ref=e92]:
            - text: Execution
            - generic [ref=e96]: "4"
          - generic [ref=e97]:
            - generic [ref=e98]: Command
            - generic [ref=e102]: Read File
            - generic [ref=e107]: Write File
            - generic [ref=e113]: HTTP Request
        - button "Logic 8" [ref=e119]:
          - text: Logic
          - generic [ref=e123]: "8"
        - button "State 2" [ref=e125]:
          - text: State
          - generic [ref=e129]: "2"
        - button "Vision 4" [ref=e131]:
          - text: Vision
          - generic [ref=e135]: "4"
        - button "Input 4" [ref=e137]:
          - text: Input
          - generic [ref=e141]: "4"
      - application [ref=e143]:
        - generic [ref=e145]:
          - generic:
            - generic:
              - img:
                - group "Edge from n1 to n2"
            - generic:
              - group [ref=e146]:
                - generic [ref=e149]:
                  - generic [ref=e150]:
                    - generic [ref=e151]: trigger
                    - generic [ref=e152]: local
                  - generic [ref=e156]: Start
                  - generic [ref=e157]: trigger.manual
              - group [ref=e159]:
                - generic [ref=e162]:
                  - generic [ref=e163]:
                    - generic [ref=e164]: execution
                    - generic [ref=e165]: local
                  - generic [ref=e169]: Echo Hello
                  - generic [ref=e170]: system.command
        - generic "Control Panel" [ref=e173]:
          - button "Zoom In" [ref=e174] [cursor=pointer]
          - button "Zoom Out" [ref=e177] [cursor=pointer]
          - button "Fit View" [ref=e180] [cursor=pointer]
          - button "Toggle Interactivity" [ref=e183] [cursor=pointer]
        - img "Mini Map" [ref=e187]
    - generic [ref=e192]:
      - generic [ref=e193]: Runs
      - generic [ref=e194]: No runs yet
  - contentinfo [ref=e196]:
    - generic [ref=e197]:
      - generic [ref=e198]: v0.1.0
      - generic [ref=e199]: "Uptime: 0m"
    - generic [ref=e200]:
      - button "AI Chat" [ref=e201]
      - button "Settings" [ref=e204]
```

# Test source

```ts
  1   | import { test, expect } from "../fixtures/base.js";
  2   | import { SIMPLE_MANUAL_COMMAND, IF_ELSE_PIPELINE } from "../fixtures/test-data.js";
  3   | 
  4   | test.describe("Canvas Visual Editor", () => {
  5   |   test("page loads with empty canvas when no automation selected", async ({ page, testServer }) => {
  6   |     await page.goto(testServer.url);
  7   |     await page.waitForSelector('text="Automation Platform"');
  8   |     expect(await page.textContent("body")).toContain("Create or select an automation");
  9   |   });
  10  | 
  11  |   test("canvas loads when an automation is selected", async ({ page, testServer, request }) => {
  12  |     await request.post(`${testServer.url}/api/automations`, {
  13  |       data: { name: "Canvas Test", definition: SIMPLE_MANUAL_COMMAND },
  14  |     });
  15  | 
  16  |     await page.goto(testServer.url);
  17  |     await page.waitForSelector('text="Canvas Test"');
  18  |     await page.click('text="Canvas Test"');
  19  | 
  20  |     await page.waitForSelector(".react-flow", { timeout: 5000 });
  21  |     expect(await page.locator(".react-flow").count()).toBe(1);
  22  |   });
  23  | 
  24  |   test("node palette is visible with all categories", async ({ page, testServer, request }) => {
  25  |     await request.post(`${testServer.url}/api/automations`, {
  26  |       data: { name: "Palette Test", definition: SIMPLE_MANUAL_COMMAND },
  27  |     });
  28  | 
  29  |     await page.goto(testServer.url);
  30  |     await page.waitForSelector('text="Palette Test"');
  31  |     await page.click('text="Palette Test"');
  32  | 
  33  |     await page.waitForSelector('text="Node Palette"', { timeout: 5000 });
  34  |     expect(await page.textContent("body")).toContain("Triggers");
  35  |     expect(await page.textContent("body")).toContain("Execution");
  36  |     expect(await page.textContent("body")).toContain("Logic");
  37  |     expect(await page.textContent("body")).toContain("State");
  38  |     expect(await page.textContent("body")).toContain("Vision");
  39  |     expect(await page.textContent("body")).toContain("Input");
  40  |   });
  41  | 
  42  |   test("nodes from definition appear on canvas", async ({ page, testServer, request }) => {
  43  |     await request.post(`${testServer.url}/api/automations`, {
  44  |       data: { name: "Nodes Test", definition: IF_ELSE_PIPELINE },
  45  |     });
  46  | 
  47  |     await page.goto(testServer.url);
  48  |     await page.waitForSelector('text="Nodes Test"');
  49  |     await page.click('text="Nodes Test"');
  50  | 
  51  |     await page.waitForSelector(".react-flow__node", { timeout: 5000 });
  52  |     const nodes = await page.locator(".react-flow__node").count();
  53  |     expect(nodes).toBe(IF_ELSE_PIPELINE.nodes.length);
  54  |   });
  55  | 
  56  |   test("edges from definition render on canvas", async ({ page, testServer, request }) => {
  57  |     await request.post(`${testServer.url}/api/automations`, {
  58  |       data: { name: "Edges Test", definition: SIMPLE_MANUAL_COMMAND },
  59  |     });
  60  | 
  61  |     await page.goto(testServer.url);
  62  |     await page.waitForSelector('text="Edges Test"');
  63  |     await page.click('text="Edges Test"');
  64  | 
> 65  |     await page.waitForSelector(".react-flow__edge", { timeout: 5000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  66  |     const edges = await page.locator(".react-flow__edge").count();
  67  |     expect(edges).toBe(SIMPLE_MANUAL_COMMAND.edges.length);
  68  |   });
  69  | 
  70  |   test("select node opens NodeEditor", async ({ page, testServer, request }) => {
  71  |     await request.post(`${testServer.url}/api/automations`, {
  72  |       data: { name: "Select Test", definition: SIMPLE_MANUAL_COMMAND },
  73  |     });
  74  | 
  75  |     await page.goto(testServer.url);
  76  |     await page.waitForSelector('text="Select Test"');
  77  |     await page.click('text="Select Test"');
  78  | 
  79  |     await page.waitForSelector(".react-flow__node", { timeout: 5000 });
  80  | 
  81  |     const firstNode = page.locator(".react-flow__node").first();
  82  |     await firstNode.click();
  83  | 
  84  |     await page.waitForSelector('text="Parameters"', { timeout: 5000 });
  85  |     expect(await page.textContent("body")).toContain("Parameters");
  86  |   });
  87  | 
  88  |   test("edit node params in editor", async ({ page, testServer, request }) => {
  89  |     await request.post(`${testServer.url}/api/automations`, {
  90  |       data: { name: "Edit Test", definition: SIMPLE_MANUAL_COMMAND },
  91  |     });
  92  | 
  93  |     await page.goto(testServer.url);
  94  |     await page.waitForSelector('text="Edit Test"');
  95  |     await page.click('text="Edit Test"');
  96  | 
  97  |     await page.waitForSelector(".react-flow__node", { timeout: 5000 });
  98  | 
  99  |     const firstNode = page.locator(".react-flow__node").first();
  100 |     await firstNode.click();
  101 | 
  102 |     await page.waitForSelector('text="Parameters"', { timeout: 5000 });
  103 | 
  104 |     const nameInput = page.locator('input[type="text"]').first();
  105 |     await nameInput.clear();
  106 |     await nameInput.fill("Renamed Node");
  107 | 
  108 |     const nodeEditor = page.locator('text="Renamed Node"');
  109 |     expect(await nodeEditor.count()).toBeGreaterThan(0);
  110 |   });
  111 | 
  112 |   test("delete node via NodeEditor delete button", async ({ page, testServer, request }) => {
  113 |     await request.post(`${testServer.url}/api/automations`, {
  114 |       data: { name: "Delete Node Test", definition: SIMPLE_MANUAL_COMMAND },
  115 |     });
  116 | 
  117 |     await page.goto(testServer.url);
  118 |     await page.waitForSelector('text="Delete Node Test"');
  119 |     await page.click('text="Delete Node Test"');
  120 | 
  121 |     await page.waitForSelector(".react-flow__node", { timeout: 5000 });
  122 |     const nodeCountBefore = await page.locator(".react-flow__node").count();
  123 | 
  124 |     const firstNode = page.locator(".react-flow__node").first();
  125 |     await firstNode.click();
  126 | 
  127 |     await page.waitForSelector('button:has-text("Delete")', { timeout: 5000 });
  128 |     await page.click('button:has-text("Delete")');
  129 | 
  130 |     await page.waitForTimeout(500);
  131 |     const nodeCountAfter = await page.locator(".react-flow__node").count();
  132 |     expect(nodeCountAfter).toBeLessThan(nodeCountBefore);
  133 |   });
  134 | 
  135 |   test("node palette category expands on click", async ({ page, testServer, request }) => {
  136 |     await request.post(`${testServer.url}/api/automations`, {
  137 |       data: { name: "Expand Test", definition: SIMPLE_MANUAL_COMMAND },
  138 |     });
  139 | 
  140 |     await page.goto(testServer.url);
  141 |     await page.waitForSelector('text="Expand Test"');
  142 |     await page.click('text="Expand Test"');
  143 | 
  144 |     await page.waitForSelector('text="Node Palette"', { timeout: 5000 });
  145 | 
  146 |     await page.click('text="Logic"');
  147 |     await page.waitForSelector('text="IF"', { timeout: 3000 });
  148 |     expect(await page.textContent("body")).toContain("IF");
  149 |     expect(await page.textContent("body")).toContain("Switch");
  150 |   });
  151 | });
  152 | 
```