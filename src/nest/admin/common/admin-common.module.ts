import { Module } from "@nestjs/common";
import { AdminAuditService } from "./admin-audit.service.js";

@Module({
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AdminCommonModule {}
