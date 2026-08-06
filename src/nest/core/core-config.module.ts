import { Global, Module, DynamicModule } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "./app-config.js";

@Global()
@Module({})
export class CoreConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: CoreConfigModule,
      providers: [
        {
          provide: APP_CONFIG,
          useValue: config,
        },
      ],
      exports: [APP_CONFIG],
      global: true,
    };
  }
}
