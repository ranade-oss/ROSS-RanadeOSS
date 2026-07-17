import assert from "node:assert/strict";
import test from "node:test";
import { streamOpenAI } from "../llm/openai";

function sse(events: unknown[]) {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

test("OpenAI tool limit performs a final synthesis turn", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    if (requestBodies.length === 1) {
      return sse([
        { response: { id: "resp-tool" } },
        {
          type: "response.output_item.added",
          item: {
            type: "function_call",
            call_id: "call-1",
            name: "lookup",
            arguments: "{}",
          },
        },
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-1",
            name: "lookup",
            arguments: "{}",
          },
        },
      ]);
    }
    return sse([
      { response: { id: "resp-final" } },
      { type: "response.output_text.delta", delta: "Final answer." },
    ]);
  };

  try {
    let visible = "";
    const result = await streamOpenAI({
      model: "gpt-5.6",
      systemPrompt: "Answer after using tools.",
      messages: [{ role: "user", content: "Check this." }],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Return synthetic evidence.",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      maxIterations: 1,
      apiKeys: { openai: "sk-synthetic" },
      callbacks: {
        onContentDelta: (delta) => {
          visible += delta;
        },
      },
      runTools: async () => [
        { tool_use_id: "call-1", content: "Synthetic evidence." },
      ],
    });

    assert.equal(requestBodies.length, 2);
    assert.ok(Array.isArray(requestBodies[0].tools));
    assert.equal(requestBodies[1].tools, undefined);
    assert.equal(result.fullText, "Final answer.");
    assert.equal(visible, "Final answer.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
