import { Module, DynamicModule } from "@nestjs/common";
import { AppConfig } from "./core/app-config.js";
import { CoreConfigModule } from "./core/core-config.module.js";

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreConfigModule.forRoot(config)],
    };
  }
}
