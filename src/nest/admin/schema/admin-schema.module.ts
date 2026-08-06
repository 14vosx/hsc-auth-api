import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module.js";
import { AdminSchemaController } from "./admin-schema.controller.js";
import { AdminSchemaRepository } from "./admin-schema.repository.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminSchemaController],
  providers: [AdminSchemaRepository],
})
export class AdminSchemaModule {}
