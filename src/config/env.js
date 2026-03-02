// src/config/env.js
import dotenv from "dotenv";

export function loadEnv() {
  dotenv.config({ path: process.env.ENV_FILE || ".env" });
}