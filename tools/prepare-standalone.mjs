import { cpSync, existsSync } from "node:fs";

// Next.js standalone output does not include static assets automatically.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public"))
  cpSync("public", ".next/standalone/public", { recursive: true });
console.log("Standalone static assets prepared.");
