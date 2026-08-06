// src/app/createExpressApp.js
import express from "express";
import { registerAllRoutes } from "../routes/register.js";

export function createExpressApp({ routesDeps, corsBundle, uploadsConfig }) {
  const app = express();
  const { corsMiddleware, preflightMiddleware, preflightPattern, corsMeta } =
    corsBundle;

  // Body parsers (DEV/HSC) — precisa vir antes das rotas
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(corsMiddleware);
  app.use(
    uploadsConfig.publicPath,
    express.static(uploadsConfig.uploadDir, {
      dotfiles: "deny",
      index: false,
      redirect: false,
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.options(preflightPattern, preflightMiddleware);

  registerAllRoutes(app, {
    ...routesDeps,
    corsMeta,
    uploadsConfig,
  });

  return app;
}
