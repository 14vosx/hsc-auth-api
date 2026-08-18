export interface ServerProvisioningAssignment {
  readonly assignmentId: string;
  readonly commandId: string;
  readonly competitiveMatchId: string;
  readonly runtimeMatchId: number;
  readonly serverKey: string;
  readonly bridgeNodeKey: string;
  readonly matchEdgeSourceKey: string;
  readonly assignedAt: Date | string;
}
