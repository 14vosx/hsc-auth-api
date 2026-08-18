import { Module } from "@nestjs/common";
import { ServerAssignmentRepository } from "./server-assignment.repository.js";
import { ServerAssignmentService } from "./server-assignment.service.js";

@Module({
  providers: [ServerAssignmentRepository, ServerAssignmentService],
  exports: [ServerAssignmentService],
})
export class ServerAssignmentModule {}
