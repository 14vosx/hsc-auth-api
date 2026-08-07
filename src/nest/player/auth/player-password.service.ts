import { Injectable } from "@nestjs/common";
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

const SCRYPT_VERSION = "v1";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

interface ScryptParameters {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  parameters: ScryptParameters,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      parameters,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function isValidPasswordInput(input: unknown): input is string {
  if (typeof input !== "string") {
    return false;
  }

  const length = Array.from(input).length;

  return (
    length >= PASSWORD_MIN_LENGTH &&
    length <= PASSWORD_MAX_LENGTH
  );
}

function isBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

@Injectable()
export class PlayerPasswordService {
  private dummyPasswordHash: Promise<string> | null = null;

  private getDummyPasswordHash(): Promise<string> {
    if (!this.dummyPasswordHash) {
      this.dummyPasswordHash = this.hashPassword(
        "HSC dummy password for timing equalization",
      );
    }

    return this.dummyPasswordHash;
  }

  isValidPassword(input: unknown): input is string {
    return isValidPasswordInput(input);
  }

  async hashPassword(input: unknown): Promise<string> {
    if (!isValidPasswordInput(input)) {
      throw new Error("invalid_player_password");
    }

    const salt = randomBytes(SCRYPT_SALT_BYTES);

    const derivedKey = await deriveKey(
      input,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAXMEM,
      },
    );

    return [
      "scrypt",
      SCRYPT_VERSION,
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      salt.toString("base64url"),
      derivedKey.toString("base64url"),
    ].join("$");
  }

  async verifyPasswordOrDummy(
    input: unknown,
    storedHash: string | null,
  ): Promise<boolean> {
    const inputIsValid = isValidPasswordInput(input);

    const candidate = inputIsValid
      ? input
      : "HSC invalid password timing equalization";

    const hash =
      storedHash ?? await this.getDummyPasswordHash();

    const matches =
      await this.verifyPassword(candidate, hash);

    return (
      storedHash !== null &&
      inputIsValid &&
      matches
    );
  }

  async verifyPassword(
    input: unknown,
    storedHash: unknown,
  ): Promise<boolean> {
    if (
      !isValidPasswordInput(input) ||
      typeof storedHash !== "string"
    ) {
      return false;
    }

    const parts = storedHash.split("$");

    if (parts.length !== 7) {
      return false;
    }

    const [
      algorithm,
      version,
      nValue,
      rValue,
      pValue,
      saltValue,
      keyValue,
    ] = parts;

    if (
      algorithm !== "scrypt" ||
      version !== SCRYPT_VERSION
    ) {
      return false;
    }

    const n = Number(nValue);
    const r = Number(rValue);
    const p = Number(pValue);

    if (
      n !== SCRYPT_N ||
      r !== SCRYPT_R ||
      p !== SCRYPT_P
    ) {
      return false;
    }

    if (
      !isBase64Url(saltValue) ||
      !isBase64Url(keyValue)
    ) {
      return false;
    }

    const salt = Buffer.from(saltValue, "base64url");
    const expectedKey = Buffer.from(keyValue, "base64url");

    if (
      salt.length !== SCRYPT_SALT_BYTES ||
      expectedKey.length !== SCRYPT_KEY_LENGTH
    ) {
      return false;
    }

    try {
      const actualKey = await deriveKey(
        input,
        salt,
        SCRYPT_KEY_LENGTH,
        {
          N: n,
          r,
          p,
          maxmem: SCRYPT_MAXMEM,
        },
      );

      return timingSafeEqual(actualKey, expectedKey);
    } catch {
      return false;
    }
  }
}
