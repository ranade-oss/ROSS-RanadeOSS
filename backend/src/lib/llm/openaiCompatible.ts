import type {
  LlmMessage,
  NormalizedToolCall,
  NormalizedToolResult,
  OpenAIToolSchema,
  StreamChatParams,
  StreamChatResult,
} from "./types";

export type OpenAICompatibleProvider = "xai" | "moonshot";

type ProviderConfig = {
  label: string;
  baseUrl: string;
  envKeys: string[];
};

const PROVIDERS: Record<OpenAICompatibleProvider, ProviderConfig> = {
  xai: {
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    envKeys: ["XAI_API_KEY"],
  },
  moonshot: {
    label: "Moonshot AI",
    baseUrl: "https://api.moonshot.ai/v1",
    envKeys: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
  },
};

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type ChatChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: ToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string; code?: string };
};

function providerApiKey(
  provider: OpenAICompatibleProvider,
  override?: string | null,
): string {
  const config = PROVIDERS[provider];
  const configured =
    override?.trim() ||
    config.envKeys
      .map((name) => process.env[name]?.trim())
      .find((value): value is string => Boolean(value)) ||
    "";
  if (!configured) {
    throw new Error(
      `${config.label} API key is not configured. Add a user key or set ${config.envKeys.join(" or ")}.`,
    );
  }
  return configured;
}

function parseSse(buffer: string): { chunks: ChatChunk[]; rest: string } {
  const blocks = buffer.split(/\n\n/);
  const rest = blocks.pop() ?? "";
  const chunks: ChatChunk[] = [];
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        chunks.push(JSON.parse(raw) as ChatChunk);
      } catch {
        // Ignore malformed provider keepalive events.
      }
    }
  }
  return { chunks, rest };
}

function normalizedTools(tools: OpenAIToolSchema[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: tool.function,
  }));
}

async function createChatCompletion(params: {
  provider: OpenAICompatibleProvider;
  model: string;
  messages: ChatMessage[];
  tools?: OpenAIToolSchema[];
  requiredToolName?: string;
  stream: boolean;
  maxTokens?: number;
  reasoningEffort?: StreamChatParams["reasoningEffort"];
  apiKey: string;
  signal?: AbortSignal;
}) {
  const config = PROVIDERS[params.provider];
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      tools: params.tools?.length ? normalizedTools(params.tools) : undefined,
      tool_choice: params.tools?.length
        ? params.requiredToolName
          ? {
              type: "function",
              function: { name: params.requiredToolName },
            }
          : "auto"
        : undefined,
      stream: params.stream,
      max_tokens: params.maxTokens ?? 16_384,
      reasoning_effort: params.reasoningEffort,
    }),
    signal: params.signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `${config.label} request failed (${response.status}): ${detail || response.statusText}`,
    );
  }
  return response;
}

export async function streamOpenAICompatible(
  provider: OpenAICompatibleProvider,
  params: StreamChatParams,
): Promise<StreamChatResult> {
  const key = providerApiKey(provider, params.apiKeys?.[provider]);
  const maxIterations = params.maxIterations ?? 10;
  const messages: ChatMessage[] = [
    { role: "system", content: params.systemPrompt },
    ...params.messages,
  ];
  let fullText = "";

  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const toolsEnabled = iteration < maxIterations;
    const response = await createChatCompletion({
      provider,
      model: params.model,
      messages,
      tools: toolsEnabled ? params.tools : [],
      requiredToolName:
        iteration === 0 && toolsEnabled
          ? params.requiredFirstToolName
          : undefined,
      stream: true,
      reasoningEffort: params.reasoningEffort,
      apiKey: key,
      signal: params.abortSignal,
    });
    if (!response.body) throw new Error("Provider response had no body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const calls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let sawReasoning = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSse(buffer);
      buffer = parsed.rest;
      for (const chunk of parsed.chunks) {
        if (chunk.error?.message) throw new Error(chunk.error.message);
        const delta = chunk.choices?.[0]?.delta;
        if (typeof delta?.reasoning_content === "string") {
          sawReasoning = true;
          params.callbacks?.onReasoningDelta?.(delta.reasoning_content);
        }
        if (typeof delta?.content === "string") {
          fullText += delta.content;
          params.callbacks?.onContentDelta?.(delta.content);
        }
        for (const toolDelta of delta?.tool_calls ?? []) {
          const index = toolDelta.index ?? 0;
          const current = calls.get(index) ?? {
            id: toolDelta.id ?? `tool-${iteration}-${index}`,
            name: "",
            arguments: "",
          };
          if (toolDelta.id) current.id = toolDelta.id;
          if (toolDelta.function?.name) current.name += toolDelta.function.name;
          if (toolDelta.function?.arguments)
            current.arguments += toolDelta.function.arguments;
          calls.set(index, current);
        }
      }
    }
    if (sawReasoning) params.callbacks?.onReasoningBlockEnd?.();

    const normalizedCalls: NormalizedToolCall[] = [...calls.values()].map(
      (call) => {
        let input: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(call.arguments || "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            input = parsed as Record<string, unknown>;
        } catch {
          input = {};
        }
        const normalized = { id: call.id, name: call.name, input };
        params.callbacks?.onToolCallStart?.(normalized);
        return normalized;
      },
    );

    if (!normalizedCalls.length || !params.runTools) break;
    messages.push({ role: "assistant", content: "" });
    const results: NormalizedToolResult[] =
      await params.runTools(normalizedCalls);
    for (const result of results) {
      messages.push({
        role: "tool",
        tool_call_id: result.tool_use_id,
        content: result.content,
      });
    }
  }

  return { fullText };
}

export async function completeOpenAICompatibleText(
  provider: OpenAICompatibleProvider,
  params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    apiKeys?: { xai?: string | null; moonshot?: string | null };
  },
): Promise<string> {
  const response = await createChatCompletion({
    provider,
    model: params.model,
    messages: [
      ...(params.systemPrompt
        ? [{ role: "system" as const, content: params.systemPrompt }]
        : []),
      { role: "user", content: params.user },
    ],
    stream: false,
    maxTokens: params.maxTokens ?? 512,
    apiKey: providerApiKey(provider, params.apiKeys?.[provider]),
  });
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return body.choices?.[0]?.message?.content ?? "";
}
