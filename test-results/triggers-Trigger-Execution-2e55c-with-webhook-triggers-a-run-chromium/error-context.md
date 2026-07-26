# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: triggers.spec.ts >> Trigger Execution >> webhook prod mode: active automation with webhook triggers a run
- Location: e2e/tests/triggers.spec.ts:117:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  29  |   edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
  30  | };
  31  | 
  32  | const WEBHOOK_DEFINITION = {
  33  |   schemaVersion: 1,
  34  |   name: "Webhook Test",
  35  |   settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  36  |   nodes: [
  37  |     {
  38  |       id: "n1",
  39  |       type: "trigger.webhook",
  40  |       typeVersion: 1,
  41  |       name: "Webhook Trigger",
  42  |       target: { kind: "local" },
  43  |       params: { path: "incoming", method: "POST" },
  44  |       disabled: false,
  45  |       position: { x: 0, y: 0 },
  46  |     },
  47  |     {
  48  |       id: "n2",
  49  |       type: "system.command",
  50  |       typeVersion: 1,
  51  |       name: "Process",
  52  |       target: { kind: "local" },
  53  |       params: { command: "echo processed" },
  54  |       disabled: false,
  55  |       position: { x: 200, y: 0 },
  56  |     },
  57  |   ],
  58  |   edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
  59  | };
  60  | 
  61  | const POLLING_DEFINITION = {
  62  |   schemaVersion: 1,
  63  |   name: "Polling Test",
  64  |   settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  65  |   nodes: [
  66  |     {
  67  |       id: "n1",
  68  |       type: "trigger.polling",
  69  |       typeVersion: 1,
  70  |       name: "Poll",
  71  |       target: { kind: "local" },
  72  |       params: { intervalSec: 60, targetType: "command", target: "echo ok", stopAfter: 0 },
  73  |       disabled: false,
  74  |       position: { x: 0, y: 0 },
  75  |     },
  76  |     {
  77  |       id: "n2",
  78  |       type: "system.command",
  79  |       typeVersion: 1,
  80  |       name: "Handle",
  81  |       target: { kind: "local" },
  82  |       params: { command: "echo change" },
  83  |       disabled: false,
  84  |       position: { x: 200, y: 0 },
  85  |     },
  86  |   ],
  87  |   edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
  88  | };
  89  | 
  90  | test.describe("Trigger Execution", () => {
  91  |   test("schedule trigger: create automation with schedule, verify it's registered", async ({ request, testServer }) => {
  92  |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  93  |       data: { name: "Schedule Test", definition: SIMPLE_DEFINITION },
  94  |     });
  95  |     expect(createResp.status()).toBe(201);
  96  |     const automation = await createResp.json();
  97  | 
  98  |     const getResp = await request.get(`${testServer.url}/api/automations/${automation.id}`);
  99  |     expect(getResp.ok()).toBeTruthy();
  100 |     const body = await getResp.json();
  101 |     expect(body.draft.nodes[0].type).toBe("trigger.schedule");
  102 |     expect(body.draft.nodes[0].params.cron).toBe("* * * * *");
  103 |   });
  104 | 
  105 |   test("webhook test mode: unregistered test webhook returns 404", async ({ request, testServer }) => {
  106 |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  107 |       data: { name: "Webhook Test", definition: WEBHOOK_DEFINITION },
  108 |     });
  109 |     const automation = await createResp.json();
  110 | 
  111 |     const hookResp = await request.post(`${testServer.url}/hooks/test/${automation.id}/incoming`, {
  112 |       data: { test: true },
  113 |     });
  114 |     expect(hookResp.status()).toBe(404);
  115 |   });
  116 | 
  117 |   test("webhook prod mode: active automation with webhook triggers a run", async ({ request, testServer }) => {
  118 |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  119 |       data: { name: "Webhook Prod Test", definition: WEBHOOK_DEFINITION },
  120 |     });
  121 |     const automation = await createResp.json();
  122 | 
  123 |     const activateResp = await request.post(`${testServer.url}/api/automations/${automation.id}/activate`);
  124 |     expect(activateResp.ok()).toBeTruthy();
  125 | 
  126 |     const hookResp = await request.post(`${testServer.url}/hooks/${automation.id}/incoming`, {
  127 |       data: { payload: "test" },
  128 |     });
> 129 |     expect(hookResp.ok()).toBeTruthy();
      |                           ^ Error: expect(received).toBeTruthy()
  130 |     const body = await hookResp.json();
  131 |     expect(body).toHaveProperty("runId");
  132 |     expect(body.status).toBe("triggered");
  133 |   });
  134 | 
  135 |   test("webhook prod mode: inactive automation returns 404", async ({ request, testServer }) => {
  136 |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  137 |       data: { name: "Inactive Webhook", definition: WEBHOOK_DEFINITION },
  138 |     });
  139 |     const automation = await createResp.json();
  140 | 
  141 |     const hookResp = await request.post(`${testServer.url}/hooks/${automation.id}/incoming`, {
  142 |       data: { payload: "test" },
  143 |     });
  144 |     expect(hookResp.status()).toBe(404);
  145 |   });
  146 | 
  147 |   test("polling trigger: create automation with polling config, verify activation", async ({ request, testServer }) => {
  148 |     const createResp = await request.post(`${testServer.url}/api/automations`, {
  149 |       data: { name: "Polling Test", definition: POLLING_DEFINITION },
  150 |     });
  151 |     expect(createResp.status()).toBe(201);
  152 |     const automation = await createResp.json();
  153 | 
  154 |     const activateResp = await request.post(`${testServer.url}/api/automations/${automation.id}/activate`);
  155 |     expect(activateResp.ok()).toBeTruthy();
  156 | 
  157 |     const getResp = await request.get(`${testServer.url}/api/automations/${automation.id}`);
  158 |     const body = await getResp.json();
  159 |     expect(body.draft.nodes[0].type).toBe("trigger.polling");
  160 |     expect(body.activeVersionId).toBeTruthy();
  161 |   });
  162 | });
  163 | 
```