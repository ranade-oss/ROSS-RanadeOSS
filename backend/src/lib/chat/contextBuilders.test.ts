import assert from "node:assert/strict";
import test from "node:test";
import { enrichWithPriorEvents } from "./contextBuilders";

test("prior-turn context identifies every legal-source provider attempt", async () => {
  const events = [
    {
      type: "legal_source_search",
      provider_id: null,
      provider_name: "Multiple legal sources",
      query: "summary judgment",
      result_count: 2,
      providers: [
        {
          provider_id: "a2aj-canada",
          provider_name: "A2AJ",
          status: "succeeded",
          result_count: 2,
        },
        {
          provider_id: "ontario-elaws",
          provider_name: "Ontario e-Laws",
          status: "failed",
          result_count: 0,
          error_code: "http-503",
        },
      ],
    },
  ];
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    async limit() {
      return { data: [{ content: events }] };
    },
  };
  const db = {
    from() {
      return query;
    },
  };

  const result = await enrichWithPriorEvents(
    [
      { role: "assistant", content: "Earlier response." },
      { role: "user", content: "Which connectors were used?" },
    ],
    "synthetic-chat",
    db as never,
    {},
  );
  const assistant = result[0].content ?? "";
  assert.match(assistant, /A2AJ: succeeded, 2 results/);
  assert.match(assistant, /Ontario e-Laws: failed, 0 results, reason http-503/);
});
