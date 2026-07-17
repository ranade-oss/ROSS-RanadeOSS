import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("fresh and upgraded databases persist optional workflow metadata", () => {
  const schema = read("backend/schema.sql");
  const migration = read(
    "backend/migrations/20260717_01_chat_message_workflow.sql",
  );

  assert.match(
    schema,
    /create table if not exists public\.chat_messages[\s\S]*?workflow jsonb,/,
  );
  assert.match(
    migration,
    /alter table public\.chat_messages[\s\S]*?add column if not exists workflow jsonb;/,
  );
});

test("chat requests stop when the user prompt cannot be saved", () => {
  const routes = [
    read("backend/src/routes/chat.ts"),
    read("backend/src/routes/projectChat.ts"),
  ];

  for (const route of routes) {
    assert.match(route, /error: userMessageError/);
    assert.match(route, /if \(userMessageError\)/);
    assert.match(route, /Failed to save user message/);
  }
});

test("the live assistant view reconciles with persisted messages", () => {
  const hook = read("frontend/src/app/hooks/useAssistantChat.ts");

  assert.match(hook, /const \{ messages: persistedMessages \} = await getChat\(finalChatId\)/);
  assert.match(hook, /setMessages\(persistedMessages\)/);
  assert.match(hook, /finalizeStreamingContent\(\);[\s\S]*?getChat\(finalChatId\)/);
});

test("chat streams finish with a canonical post-persistence snapshot", () => {
  const routes = [
    read("backend/src/routes/chat.ts"),
    read("backend/src/routes/projectChat.ts"),
  ];
  const hook = read("frontend/src/app/hooks/useAssistantChat.ts");

  for (const route of routes) {
    assert.match(
      route,
      /persistedEvents[\s\S]*?type: "assistant_message_final"[\s\S]*?events: persistedEvents/,
    );
  }
  assert.match(hook, /data\.type === "assistant_message_final"/);
  assert.match(hook, /eventsRef\.current = finalEvents/);
  assert.match(hook, /events: finalEvents/);
});
