import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { MatchIngressError } from "./match-ingress-error.js";
import {
  parseLocalMatchIdHeader,
  validateEdgeEventId,
  validateEdgeReceivedAt,
  validateEdgeSequence,
  validateEventName,
  validateParsedPayload,
  validatePayloadSha256,
  validateSourceKey,
  validateStrictUtf8,
} from "./match-ingress-contract.js";
import { MatchIngressRepository } from "./match-ingress.repository.js";

export const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KiB = 262144 bytes

export interface IngressResult {
  ok: true;
  accepted: true;
  duplicate: boolean;
  sourceKey: string;
  edgeEventId: string;
}

export interface IngressHeaders {
  edgeSequence?: string | string[];
  eventName?: string | string[];
  edgeReceivedAt?: string | string[];
  payloadSha256?: string | string[];
  localMatchId?: string | string[];
}

@Injectable()
export class MatchIngressService {
  constructor(private readonly repository: MatchIngressRepository) {}

  async ingestEvent(
    request: IncomingMessage,
    rawSourceKey: string,
    rawEdgeEventId: string,
    headers: IngressHeaders,
  ): Promise<IngressResult> {
    const sourceKey = validateSourceKey(rawSourceKey);
    const edgeEventId = validateEdgeEventId(rawEdgeEventId);
    const edgeSequence = validateEdgeSequence(headers.edgeSequence);
    const eventName = validateEventName(headers.eventName);
    const edgeReceivedAt = validateEdgeReceivedAt(headers.edgeReceivedAt);
    const payloadSha256 = validatePayloadSha256(headers.payloadSha256);
    const localMatchIdHeader = parseLocalMatchIdHeader(headers.localMatchId);

    const rawBuffer = await this.readStreamBytes(request);

    const computedSha256 = createHash("sha256").update(rawBuffer).digest("hex");
    if (computedSha256 !== payloadSha256) {
      throw new MatchIngressError(400, "sha256_mismatch");
    }

    const payloadJsonText = validateStrictUtf8(rawBuffer);

    const { localMatchId } = validateParsedPayload(
      payloadJsonText,
      eventName,
      localMatchIdHeader,
    );

    const { duplicate } = await this.repository.saveEvent({
      sourceKey,
      edgeEventId,
      edgeSequence,
      eventName,
      localMatchId,
      edgeReceivedAt,
      payloadJsonText,
      payloadSha256,
    });

    return {
      ok: true,
      accepted: true,
      duplicate,
      sourceKey,
      edgeEventId,
    };
  }

  private async readStreamBytes(request: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of request) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_PAYLOAD_BYTES) {
        throw new MatchIngressError(413, "payload_too_large");
      }
      chunks.push(buf);
    }

    return Buffer.concat(chunks);
  }
}
