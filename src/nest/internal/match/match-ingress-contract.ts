import { MatchIngressError } from "./match-ingress-error.js";

const SOURCE_KEY_RE = /^[a-z0-9][a-z0-9._-]*$/;
const EDGE_EVENT_ID_RE = /^[0-9a-f]{32}$/;
const PAYLOAD_SHA256_RE = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const INTEGER_RE = /^\d+$/;

export function validateSourceKey(sourceKey: string): string {
  const value = String(sourceKey ?? "").trim();
  if (!value || value.length > 64 || !SOURCE_KEY_RE.test(value)) {
    throw new MatchIngressError(400, "invalid_source_key");
  }
  return value;
}

export function validateEdgeEventId(edgeEventId: string): string {
  const value = String(edgeEventId ?? "").trim();
  if (!EDGE_EVENT_ID_RE.test(value)) {
    throw new MatchIngressError(400, "invalid_edge_event_id");
  }
  return value;
}

export function validateEdgeSequence(input: string | string[] | undefined): bigint {
  const raw = Array.isArray(input) ? input[0] : input;
  const str = String(raw ?? "").trim();
  if (!INTEGER_RE.test(str)) {
    throw new MatchIngressError(400, "invalid_edge_sequence");
  }
  const parsed = Number(str);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new MatchIngressError(400, "invalid_edge_sequence");
  }
  return BigInt(str);
}

export function validateEventName(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const str = String(raw ?? "").trim();
  if (!str || str.length > 64) {
    throw new MatchIngressError(400, "invalid_event_name");
  }
  return str;
}

export function validateEdgeReceivedAt(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const str = String(raw ?? "").trim();
  if (!UTC_TIMESTAMP_RE.test(str)) {
    throw new MatchIngressError(400, "invalid_edge_received_at");
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) {
    throw new MatchIngressError(400, "invalid_edge_received_at");
  }
  return str;
}

export function validatePayloadSha256(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const str = String(raw ?? "").trim();
  if (!PAYLOAD_SHA256_RE.test(str)) {
    throw new MatchIngressError(400, "invalid_payload_sha256");
  }
  return str;
}

export function parseLocalMatchIdHeader(input: string | string[] | undefined): bigint | null {
  const raw = Array.isArray(input) ? input[0] : input;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }
  const str = String(raw).trim();
  if (!INTEGER_RE.test(str)) {
    throw new MatchIngressError(400, "invalid_local_match_id");
  }
  const parsed = Number(str);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new MatchIngressError(400, "invalid_local_match_id");
  }
  return BigInt(str);
}

export function validateStrictUtf8(buffer: Buffer): string {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(buffer);
  } catch {
    throw new MatchIngressError(400, "malformed_utf8");
  }
}

export function validateParsedPayload(
  payloadJsonText: string,
  headerEventName: string,
  localMatchIdHeader: bigint | null,
): { parsed: Record<string, unknown>; localMatchId: bigint | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJsonText);
  } catch {
    throw new MatchIngressError(400, "malformed_json");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new MatchIngressError(400, "non_object_json");
  }

  const obj = parsed as Record<string, unknown>;
  const eventInBody = String(obj.event ?? "").trim();
  if (!eventInBody || eventInBody !== headerEventName) {
    throw new MatchIngressError(400, "event_mismatch");
  }

  if (headerEventName === "series_end") {
    const rawMatchId = obj.matchid;
    if (typeof rawMatchId !== "number" || !Number.isInteger(rawMatchId) || rawMatchId <= 0) {
      throw new MatchIngressError(400, "invalid_series_end_matchid");
    }
    if (localMatchIdHeader === null) {
      throw new MatchIngressError(400, "missing_local_match_id_header");
    }
    if (BigInt(rawMatchId) !== localMatchIdHeader) {
      throw new MatchIngressError(400, "series_end_matchid_mismatch");
    }
    return { parsed: obj, localMatchId: localMatchIdHeader };
  }

  return { parsed: obj, localMatchId: localMatchIdHeader };
}
