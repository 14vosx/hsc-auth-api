import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: false,
  plugins: [
    swc.vite({
      tsconfigFile: "tsconfig.vitest.json",
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    environment: "node",
    globals: false,
    include: [
      "test/vitest/**/*.spec.ts",
      "test/vitest/**/*.spec.js",
    ],
    setupFiles: ["test/vitest/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
