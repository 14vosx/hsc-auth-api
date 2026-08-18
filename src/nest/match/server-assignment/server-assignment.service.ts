import { Injectable } from "@nestjs/common";
import type { ServerProvisioningAssignment } from "./server-assignment.contract.js";
import { ServerAssignmentRepository } from "./server-assignment.repository.js";

const MAX_BRIDGE_NODE_KEY_LENGTH = 64;

@Injectable()
export class ServerAssignmentService {
  constructor(
    private readonly repository: ServerAssignmentRepository,
  ) {}

  async assignNextReadyForBridgeNode(
    bridgeNodeKey: string,
  ): Promise<ServerProvisioningAssignment | null> {
    if (typeof bridgeNodeKey !== "string") {
      throw new TypeError("bridgeNodeKey must be a string.");
    }

    const trimmed = bridgeNodeKey.trim();
    if (trimmed.length === 0) {
      throw new TypeError("bridgeNodeKey cannot be empty or whitespace.");
    }

    if (trimmed.length > MAX_BRIDGE_NODE_KEY_LENGTH) {
      throw new TypeError(
        `bridgeNodeKey exceeds maximum length of ${MAX_BRIDGE_NODE_KEY_LENGTH} characters.`,
      );
    }

    return this.repository.assignNextReadyForBridgeNode(trimmed);
  }
}
