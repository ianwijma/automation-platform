import { test, expect } from "../fixtures/base.js";
import { SIMPLE_MANUAL_COMMAND, IF_ELSE_PIPELINE } from "../fixtures/test-data.js";

test.describe("Canvas Visual Editor", () => {
  test("page loads with empty canvas when no automation selected", async ({ page, testServer }) => {
    await page.goto(testServer.url);
    await page.waitForSelector('text="Automation Platform"');
    expect(await page.textContent("body")).toContain("Create or select an automation");
  });

  test("canvas loads when an automation is selected", async ({ page, testServer, request }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Canvas Test", definition: SIMPLE_MANUAL_COMMAND },
    });

    await page.goto(testServer.url);
    await page.waitForSelector('text="Canvas Test"');
    await page.click('text="Canvas Test"');

    await page.waitForSelector(".react-flow", { timeout: 5000 });
    expect(await page.locator(".react-flow").count()).toBe(1);
  });

  test("node palette is visible with all categories", async ({ page, testServer, request }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Palette Test", definition: SIMPLE_MANUAL_COMMAND },
    });

    await page.goto(testServer.url);
    await page.waitForSelector('text="Palette Test"');
    await page.click('text="Palette Test"');

    await page.waitForSelector('text="Node Palette"', { timeout: 5000 });
    expect(await page.textContent("body")).toContain("Triggers");
    expect(await page.textContent("body")).toContain("Execution");
    expect(await page.textContent("body")).toContain("Logic");
    expect(await page.textContent("body")).toContain("State");
    expect(await page.textContent("body")).toContain("Vision");
    expect(await page.textContent("body")).toContain("Input");
  });

  test("nodes from definition appear on canvas", async ({ page, testServer, request }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Nodes Test", definition: IF_ELSE_PIPELINE },
    });

    await page.goto(testServer.url);
    await page.waitForSelector('text="Nodes Test"');
    await page.click('text="Nodes Test"');

    await page.waitForSelector(".react-flow__node", { timeout: 5000 });
    const nodes = await page.locator(".react-flow__node").count();
    expect(nodes).toBe(IF_ELSE_PIPELINE.nodes.length);
  });

  test("edges from definition render on canvas", async ({ page, testServer, request }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Edges Test", definition: SIMPLE_MANUAL_COMMAND },
    });

    await page.goto(testServer.url);
    await page.waitForSelector('text="Edges Test"');
    await page.click('text="Edges Test"');

    await page.waitForSelector(".react-flow__edge", { timeout: 5000 });
    const edges = await page.locator(".react-flow__edge").count();
    expect(edges).toBe(SIMPLE_MANUAL_COMMAND.edges.length);
  });

  test("select node opens NodeEditor", async ({ page, testServer, request }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Select Test", definition: SIMPLE_MANUAL_COMMAND },
    });

    await page.goto(testServer.url);
    await page.waitForSelector('text="Select Test"');
    await page.click('text="Select Test"');

    await page.waitForSelector(".react-flow__node", { timeout: 5000 });

    const firstNode = page.locator(".react-flow__node").first();
    await firstNode.click();

    await page.waitForSelector('text="Parameters"', { timeout: 5000 });
    expect(await page.textContent("body")).toContain("Parameters");
  });

  test("edit node params in editor", async ({ page, testServer, request }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Edit Test", definition: SIMPLE_MANUAL_COMMAND },
    });

    await page.goto(testServer.url);
    await page.waitForSelector('text="Edit Test"');
    await page.click('text="Edit Test"');

    await page.waitForSelector(".react-flow__node", { timeout: 5000 });

    const firstNode = page.locator(".react-flow__node").first();
    await firstNode.click();

    await page.waitForSelector('text="Parameters"', { timeout: 5000 });

    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.clear();
    await nameInput.fill("Renamed Node");

    const nodeEditor = page.locator('text="Renamed Node"');
    expect(await nodeEditor.count()).toBeGreaterThan(0);
  });

  test("delete node via NodeEditor delete button", async ({ page, testServer, request }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Delete Node Test", definition: SIMPLE_MANUAL_COMMAND },
    });

    await page.goto(testServer.url);
    await page.waitForSelector('text="Delete Node Test"');
    await page.click('text="Delete Node Test"');

    await page.waitForSelector(".react-flow__node", { timeout: 5000 });
    const nodeCountBefore = await page.locator(".react-flow__node").count();

    const firstNode = page.locator(".react-flow__node").first();
    await firstNode.click();

    await page.waitForSelector('button:has-text("Delete")', { timeout: 5000 });
    await page.click('button:has-text("Delete")');

    await page.waitForTimeout(500);
    const nodeCountAfter = await page.locator(".react-flow__node").count();
    expect(nodeCountAfter).toBeLessThan(nodeCountBefore);
  });

  test("node palette category expands on click", async ({ page, testServer, request }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Expand Test", definition: SIMPLE_MANUAL_COMMAND },
    });

    await page.goto(testServer.url);
    await page.waitForSelector('text="Expand Test"');
    await page.click('text="Expand Test"');

    await page.waitForSelector('text="Node Palette"', { timeout: 5000 });

    await page.click('text="Logic"');
    await page.waitForSelector('text="IF"', { timeout: 3000 });
    expect(await page.textContent("body")).toContain("IF");
    expect(await page.textContent("body")).toContain("Switch");
  });
});
