#!/usr/bin/env node

import { spawn } from "child_process";
import process from "process";

const port = process.env.PORT || 5173;
const args = ["-l", String(port), "-s", "dist"];

const serve = spawn("serve", args, {
  stdio: "inherit",
  shell: true,
});

serve.on("error", (err) => {
  console.error("Failed to start serve:", err);
  process.exit(1);
});

serve.on("exit", (code) => {
  process.exit(code);
});
