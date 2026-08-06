import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { APP_CONFIG, AppConfig } from "../../core/app-config.js";
import { CoreConfigModule } from "../../core/core-config.module.js";
import { AdminAuthModule } from "../auth/admin-auth.module.js";
import { AdminCommonModule } from "../common/admin-common.module.js";
import { AdminUploadsController } from "./admin-uploads.controller.js";
import { AdminUploadExceptionFilter } from "./admin-upload-exception.filter.js";
import { AdminUploadsService } from "./admin-uploads.service.js";

@Module({
  imports: [
    CoreConfigModule,
    AdminAuthModule,
    AdminCommonModule,
    MulterModule.registerAsync({
      imports: [CoreConfigModule],
      inject: [APP_CONFIG],
      useFactory(config: AppConfig) {
        return {
          limits: {
            fileSize: config.uploads.maxBytes,
            files: 1,
          },
        };
      },
    }),
  ],
  controllers: [AdminUploadsController],
  providers: [AdminUploadsService, AdminUploadExceptionFilter],
})
export class AdminUploadsModule {}
