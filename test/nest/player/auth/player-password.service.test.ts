import test from "node:test";
import assert from "node:assert/strict";

import {
  PlayerPasswordService,
} from "../../../../src/nest/player/auth/player-password.service.js";

test("PlayerPasswordService - valida política de tamanho", () => {
  const service = new PlayerPasswordService();

  assert.equal(service.isValidPassword("123456789"), false);
  assert.equal(service.isValidPassword("1234567890"), true);
  assert.equal(service.isValidPassword("a".repeat(128)), true);
  assert.equal(service.isValidPassword("a".repeat(129)), false);
});

test("PlayerPasswordService - gera hashes diferentes para a mesma senha", async () => {
  const service = new PlayerPasswordService();
  const password = "correct horse battery staple";

  const first = await service.hashPassword(password);
  const second = await service.hashPassword(password);

  assert.notEqual(first, password);
  assert.notEqual(first, second);

  assert.match(
    first,
    /^scrypt\$v1\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
  );
});

test("PlayerPasswordService - verifica senha correta", async () => {
  const service = new PlayerPasswordService();
  const password = "correct horse battery staple";

  const hash = await service.hashPassword(password);

  assert.equal(
    await service.verifyPassword(password, hash),
    true,
  );
});

test("PlayerPasswordService - rejeita senha incorreta", async () => {
  const service = new PlayerPasswordService();

  const hash = await service.hashPassword(
    "correct horse battery staple",
  );

  assert.equal(
    await service.verifyPassword("wrong password value", hash),
    false,
  );
});

test("PlayerPasswordService - rejeita hashes inválidos", async () => {
  const service = new PlayerPasswordService();

  assert.equal(
    await service.verifyPassword(
      "correct horse battery staple",
      "invalid",
    ),
    false,
  );

  assert.equal(
    await service.verifyPassword(
      "correct horse battery staple",
      "scrypt$v2$16384$8$1$invalid$invalid",
    ),
    false,
  );
});

test("PlayerPasswordService - dummy verification preserva resposta falsa sem identidade", async () => {
  const service = new PlayerPasswordService();

  assert.equal(
    await service.verifyPasswordOrDummy(
      "any-password-value",
      null,
    ),
    false,
  );
});

test("PlayerPasswordService - dummy verification também rejeita entrada fora da política", async () => {
  const service = new PlayerPasswordService();

  assert.equal(
    await service.verifyPasswordOrDummy("short", null),
    false,
  );
});
