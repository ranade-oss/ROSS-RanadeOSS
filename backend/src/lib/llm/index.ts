import { streamClaude, completeClaudeText } from "./claude";
import { streamGemini, completeGeminiText } from "./gemini";
import { streamOpenAI, completeOpenAIText } from "./openai";
import {
    completeOpenAICompatibleText,
    streamOpenAICompatible,
} from "./openaiCompatible";
import { providerForModel } from "./models";
import type { Provider, StreamChatParams, StreamChatResult, UserApiKeys } from "./types";
import { loadRuntimeConfig } from "../../config/runtime";

function enforceHostedProvider(provider: Provider) {
    const runtime = loadRuntimeConfig();
    if (
        runtime.hostedMode !== "self-hosted" &&
        !runtime.hostedModelProviders.includes(provider)
    )
        throw new Error(
            `Model provider ${provider} is not approved for this hosted deployment.`,
        );
}

export * from "./types";
export * from "./models";
export * from "./runtimeModels";

export async function streamChatWithTools(
    params: StreamChatParams,
): Promise<StreamChatResult> {
    const provider = providerForModel(params.model);
    enforceHostedProvider(provider);
    if (provider === "claude") return streamClaude(params);
    if (provider === "openai") return streamOpenAI(params);
    if (provider === "xai") return streamOpenAICompatible("xai", params);
    if (provider === "moonshot")
        return streamOpenAICompatible("moonshot", params);
    return streamGemini(params);
}

export async function completeText(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    apiKeys?: UserApiKeys;
}): Promise<string> {
    const provider = providerForModel(params.model);
    enforceHostedProvider(provider);
    if (provider === "claude") return completeClaudeText(params);
    if (provider === "openai") return completeOpenAIText(params);
    if (provider === "xai")
        return completeOpenAICompatibleText("xai", params);
    if (provider === "moonshot")
        return completeOpenAICompatibleText("moonshot", params);
    return completeGeminiText(params);
}
