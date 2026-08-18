import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_TEXT = `[Unit]
Description=HSC Auth API Season lifecycle reconciliation
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=hscadmin
Group=hscadmin
WorkingDirectory=/opt/hsc/hsc-auth-api
ExecStart=/usr/bin/node /opt/hsc/hsc-auth-api/scripts/reconcile-seasons.js
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hsc-auth-api-reconcile-seasons
TimeoutStartSec=60
`;

const TIMER_TEXT = `[Unit]
Description=Run HSC Season lifecycle reconciliation every five minutes

[Timer]
OnCalendar=*-*-* *:0/5:00
Persistent=true
AccuracySec=30s
Unit=hsc-auth-api-reconcile-seasons.service

[Install]
WantedBy=timers.target
`;

function repositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

async function readUnitFile(filename) {
  const raw = await readFile(
    path.join(repositoryRoot(), "deploy", "systemd", filename),
    "utf8",
  );
  assert.equal(raw.endsWith("\n"), true, `${filename} must end with a newline`);
  return raw.replace(/\r\n/g, "\n");
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function countDirective(text, name) {
  return countMatches(text, new RegExp(`^${name}=`, "gm"));
}

test("systemd reconciliation service matches the approved runtime contract", async () => {
  const service = await readUnitFile(
    "hsc-auth-api-reconcile-seasons.service",
  );

  assert.equal(service, SERVICE_TEXT);
  assert.equal(countMatches(service, /^\[Unit\]$/gm), 1);
  assert.equal(countMatches(service, /^\[Service\]$/gm), 1);
  assert.equal(countMatches(service, /^\[Install\]$/gm), 0);

  for (const directive of [
    "Type=oneshot",
    "User=hscadmin",
    "Group=hscadmin",
    "WorkingDirectory=/opt/hsc/hsc-auth-api",
    "ExecStart=/usr/bin/node /opt/hsc/hsc-auth-api/scripts/reconcile-seasons.js",
    "StandardOutput=journal",
    "StandardError=journal",
    "SyslogIdentifier=hsc-auth-api-reconcile-seasons",
    "TimeoutStartSec=60",
  ]) {
    assert.equal(countMatches(service, new RegExp(`^${directive}$`, "gm")), 1);
  }

  const execStart = service.match(/^ExecStart=(.+)$/m)?.[1];
  assert.match(execStart, /^\/usr\/bin\/node /);
  assert.match(
    execStart,
    /^\/usr\/bin\/node \/opt\/hsc\/hsc-auth-api\/scripts\/reconcile-seasons\.js$/,
  );
  assert.doesNotMatch(execStart, /(?:^|[\s/])(?:sh|bash|sudo|flock)(?:[\s/]|$)/);
  assert.doesNotMatch(execStart, /[<>|]/);
  assert.doesNotMatch(execStart, /\$(?:[A-Za-z_{(])/);

  for (const forbidden of [
    "Environment",
    "EnvironmentFile",
    "Restart",
    "RestartSec",
    "ExecStartPre",
    "ExecStartPost",
    "ProtectSystem",
    "ProtectHome",
    "PrivateTmp",
    "NoNewPrivileges",
  ]) {
    assert.equal(countDirective(service, forbidden), 0);
  }
  assert.equal(countMatches(service, /^User=root$/gm), 0);

  for (const sensitive of [
    "Type",
    "User",
    "Group",
    "WorkingDirectory",
    "ExecStart",
    "TimeoutStartSec",
  ]) {
    assert.equal(countDirective(service, sensitive), 1);
  }
});

test("systemd reconciliation timer runs every five minutes without jitter", async () => {
  const timer = await readUnitFile("hsc-auth-api-reconcile-seasons.timer");

  assert.equal(timer, TIMER_TEXT);
  assert.equal(countMatches(timer, /^\[Unit\]$/gm), 1);
  assert.equal(countMatches(timer, /^\[Timer\]$/gm), 1);
  assert.equal(countMatches(timer, /^\[Install\]$/gm), 1);

  for (const directive of [
    "OnCalendar=*-*-* *:0/5:00",
    "Persistent=true",
    "AccuracySec=30s",
    "Unit=hsc-auth-api-reconcile-seasons.service",
    "WantedBy=timers.target",
  ]) {
    assert.equal(countMatches(timer, new RegExp(`^${directive.replaceAll("*", "\\*")}$`, "gm")), 1);
  }

  for (const forbidden of [
    "RandomizedDelaySec",
    "OnBootSec",
    "OnStartupSec",
    "OnUnitActiveSec",
    "OnActiveSec",
    "WakeSystem",
    "ExecStart",
    "User",
    "Group",
    "WorkingDirectory",
  ]) {
    assert.equal(countDirective(timer, forbidden), 0);
  }

  assert.equal(countDirective(timer, "OnCalendar"), 1);
  assert.equal(countDirective(timer, "Unit"), 1);
  assert.equal(
    countMatches(timer, /^Unit=hsc-auth-api-reconcile-seasons\.service$/gm),
    1,
  );
});
