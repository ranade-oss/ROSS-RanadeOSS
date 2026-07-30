import type { LlmMessage } from "../llm";

const CONNECTOR_AUDIT_QUESTION =
  /\b(which|what)\s+(?:legal[- ]source\s+)?connectors?\s+(?:were|was|did|have)\b|\bconnectors?\s+(?:were|was)\s+(?:actually\s+)?used\b/i;

const EXPLICIT_COURTLISTENER_REQUEST = /\bcourt\s*listener\b/i;

const EXPLICIT_RESEARCH_REQUEST =
  /\b(research|search|find|locate|look\s+up|verify|validate|check|cite|retrieve|not(?:e|ing)[ -]?up)\b/i;

const LEGAL_AUTHORITY_SUBJECT =
  /\b(case\s+law|cases?|decisions?|authorit(?:y|ies)|precedents?|citations?|statutes?|legislation|regulations?|rules?|practice\s+directions?|current\s+law|legal\s+sources?|canlii|a2aj|e-?laws?|justice\s+laws?)\b/i;

const DIRECT_LEGAL_QUESTION =
  /\b(what\s+is|what\s+are|does|do|can|when|whether|is|are)\b[\s\S]{0,120}\b(law|legal|statute|regulation|rule|court|appeal|limitation|jurisdiction)\b/i;

/**
 * The model remains free to use other tools after the first round, but a
 * request that plainly asks for legal research must begin with source
 * discovery. This prevents a polished model-memory answer from bypassing the
 * authorized connector layer.
 */
export function requiresLegalSourceSearch(messages: LlmMessage[]): boolean {
  const latestUser = [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.content.trim();
  if (
    !latestUser ||
    CONNECTOR_AUDIT_QUESTION.test(latestUser) ||
    EXPLICIT_COURTLISTENER_REQUEST.test(latestUser)
  )
    return false;
  return (
    (EXPLICIT_RESEARCH_REQUEST.test(latestUser) &&
      LEGAL_AUTHORITY_SUBJECT.test(latestUser)) ||
    DIRECT_LEGAL_QUESTION.test(latestUser)
  );
}
