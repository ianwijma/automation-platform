# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: execution.spec.ts >> Execution >> dry-run mode executes without side effects
- Location: e2e/tests/execution.spec.ts:62:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1   | import { test, expect } from "../fixtures/base.js";
  2   | import { SIMPLE_MANUAL_COMMAND, ERROR_PIPELINE } from "../fixtures/test-data.js";
  3   | 
  4   | async function createAndActivate(
  5   |   request: any,
  6   |   url: string,
  7   |   definition: any = SIMPLE_MANUAL_COMMAND,
  8   |   name: string = "Run Test",
  9   | ): Promise<{ id: string }> {
  10  |   const createResp = await request.post(`${url}/api/automations`, {
  11  |     data: { name, definition },
  12  |   });
  13  |   const { id } = await createResp.json();
  14  |   await request.post(`${url}/api/automations/${id}/activate`);
  15  |   return { id };
  16  | }
  17  | 
  18  | test.describe("Execution", () => {
  19  |   test("run automation returns with status", async ({ request, testServer }) => {
  20  |     const { id } = await createAndActivate(request, testServer.url);
  21  | 
  22  |     const runResp = await request.post(`${testServer.url}/api/automations/${id}/run`, {
  23  |       data: { mode: "manual" },
  24  |     });
  25  |     expect(runResp.status()).toBe(201);
  26  |     const run = await runResp.json();
  27  |     expect(run.id).toBeDefined();
  28  |     expect(run.automationId).toBe(id);
  29  |     expect(["success", "error", "running"]).toContain(run.status);
  30  |     expect(run.startedAt).toBeDefined();
  31  |   });
  32  | 
  33  |   test("run appears in run history", async ({ request, testServer }) => {
  34  |     const { id } = await createAndActivate(request, testServer.url);
  35  | 
  36  |     await request.post(`${testServer.url}/api/automations/${id}/run`, {
  37  |       data: { mode: "manual" },
  38  |     });
  39  | 
  40  |     const runsResp = await request.get(`${testServer.url}/api/runs?automationId=${id}`);
  41  |     expect(runsResp.ok()).toBeTruthy();
  42  |     const runs = await runsResp.json();
  43  |     expect(runs.length).toBeGreaterThanOrEqual(1);
  44  |     expect(runs[0].automationId).toBe(id);
  45  |   });
  46  | 
  47  |   test("run details include node executions", async ({ request, testServer }) => {
  48  |     const { id } = await createAndActivate(request, testServer.url);
  49  | 
  50  |     const runResp = await request.post(`${testServer.url}/api/automations/${id}/run`, {
  51  |       data: { mode: "manual" },
  52  |     });
  53  |     const run = await runResp.json();
  54  | 
  55  |     const detailResp = await request.get(`${testServer.url}/api/runs/${run.id}`);
  56  |     expect(detailResp.ok()).toBeTruthy();
  57  |     const detail = await detailResp.json();
  58  |     expect(detail.nodeExecutions).toBeDefined();
  59  |     expect(Array.isArray(detail.nodeExecutions)).toBeTruthy();
  60  |   });
  61  | 
  62  |   test("dry-run mode executes without side effects", async ({ request, testServer }) => {
  63  |     const { id } = await createAndActivate(request, testServer.url);
  64  | 
  65  |     const runResp = await request.post(`${testServer.url}/api/automations/${id}/run`, {
  66  |       data: { mode: "manual", dryRun: true },
  67  |     });
  68  |     expect(runResp.status()).toBe(201);
  69  |     const run = await runResp.json();
  70  |     expect(run.mode).toBe("manual");
> 71  |     expect(run.nodeExecutions.some((ne: { simulated: boolean }) => ne.simulated)).toBeTruthy();
      |                                                                                   ^ Error: expect(received).toBeTruthy()
  72  |   });
  73  | 
  74  |   test("error pipeline causes run to fail", async ({ request, testServer }) => {
  75  |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  76  |       data: { name: "Error Test", definition: ERROR_PIPELINE },
  77  |     });
  78  |     const { id } = await createResp.json();
  79  |     await request.post(`${testServer.url}/api/automations/${id}/activate`);
  80  | 
  81  |     const runResp = await request.post(`${testServer.url}/api/automations/${id}/run`, {
  82  |       data: { mode: "manual" },
  83  |     });
  84  |     const run = await runResp.json();
  85  | 
  86  |     const detailResp = await request.get(`${testServer.url}/api/runs/${run.id}`);
  87  |     const detail = await detailResp.json();
  88  |     expect(detail.status).toBe("error");
  89  |     expect(detail.error).toContain("intentional test error");
  90  |   });
  91  | 
  92  |   test("run without activation uses draft", async ({ request, testServer }) => {
  93  |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  94  |       data: { name: "Draft Run", definition: SIMPLE_MANUAL_COMMAND },
  95  |     });
  96  |     const { id } = await createResp.json();
  97  | 
  98  |     const runResp = await request.post(`${testServer.url}/api/automations/${id}/run`, {
  99  |       data: { mode: "manual" },
  100 |     });
  101 |     expect(runResp.status()).toBe(201);
  102 |     const run = await runResp.json();
  103 |     expect(run.id).toBeDefined();
  104 |   });
  105 | 
  106 |   test("run for nonexistent automation returns 404", async ({ request, testServer }) => {
  107 |     const runResp = await request.post(`${testServer.url}/api/automations/nonexistent/run`, {
  108 |       data: { mode: "manual" },
  109 |     });
  110 |     expect(runResp.status()).toBe(404);
  111 |   });
  112 | });
  113 | 
```