import { describe, test, expect } from "bun:test";
import {
  generateInstanceKey,
  deriveKey,
  encryptData,
  decryptData,
  encryptForStorage,
  decryptFromStorage,
} from "../src/core/crypto.js";

describe("crypto utilities", () => {
  test("encrypt/decrypt round-trip", () => {
    const key = generateInstanceKey();
    const plaintext = "hello world";
    const { encrypted, iv, tag } = encryptData(plaintext, key);
    const decrypted = decryptData(encrypted, iv, tag, key);
    expect(decrypted).toBe(plaintext);
  });

  test("encrypt/decrypt with different data", () => {
    const key = generateInstanceKey();
    const plaintext = JSON.stringify({ user: "admin", pass: "s3cret!" });
    const { encrypted, iv, tag } = encryptData(plaintext, key);
    const decrypted = decryptData(encrypted, iv, tag, key);
    expect(decrypted).toBe(plaintext);
  });

  test("deriveKey produces deterministic output", () => {
    const masterKey = generateInstanceKey();
    const salt = Buffer.from("test-salt");
    const derived1 = deriveKey(masterKey, salt);
    const derived2 = deriveKey(masterKey, salt);
    expect(Buffer.from(derived1).toString("hex")).toBe(Buffer.from(derived2).toString("hex"));
  });

  test("deriveKey with different salts produces different keys", () => {
    const masterKey = generateInstanceKey();
    const derived1 = deriveKey(masterKey, Buffer.from("salt-a"));
    const derived2 = deriveKey(masterKey, Buffer.from("salt-b"));
    expect(Buffer.from(derived1).toString("hex")).not.toBe(Buffer.from(derived2).toString("hex"));
  });

  test("envelope encryption round-trip", () => {
    const instanceKey = generateInstanceKey();
    const plaintext = "envelope test data with special chars: !@#$%^&*()";
    const blob = encryptForStorage(plaintext, instanceKey);
    const decrypted = decryptFromStorage(blob, instanceKey);
    expect(decrypted).toBe(plaintext);
  });

  test("envelope encryption round-trip with JSON values", () => {
    const instanceKey = generateInstanceKey();
    const values = { username: "admin", password: "p@ssw0rd", apiKey: "sk-12345" };
    const plaintext = JSON.stringify(values);
    const blob = encryptForStorage(plaintext, instanceKey);
    const decrypted = decryptFromStorage(blob, instanceKey);
    expect(JSON.parse(decrypted)).toEqual(values);
  });

  test("wrong key fails to decrypt", () => {
    const key1 = generateInstanceKey();
    const key2 = generateInstanceKey();
    const plaintext = "secret data";
    const { encrypted, iv, tag } = encryptData(plaintext, key1);
    expect(() => decryptData(encrypted, iv, tag, key2)).toThrow();
  });

  test("wrong instance key fails envelope decryption", () => {
    const key1 = generateInstanceKey();
    const key2 = generateInstanceKey();
    const plaintext = "envelope secret";
    const blob = encryptForStorage(plaintext, key1);
    expect(() => decryptFromStorage(blob, key2)).toThrow();
  });

  test("generateInstanceKey produces 32-byte keys", () => {
    const key = generateInstanceKey();
    expect(key.length).toBe(32);
  });

  test("deriveKey produces 32-byte keys", () => {
    const masterKey = generateInstanceKey();
    const salt = Buffer.from("salt");
    const derived = deriveKey(masterKey, salt);
    expect(Buffer.from(derived).length).toBe(32);
  });

  test("each encryption produces different ciphertext", () => {
    const key = generateInstanceKey();
    const plaintext = "same data";
    const result1 = encryptData(plaintext, key);
    const result2 = encryptData(plaintext, key);
    expect(result1.encrypted).not.toBe(result2.encrypted);
    expect(result1.iv).not.toBe(result2.iv);
  });

  test("each envelope encryption produces different blobs", () => {
    const instanceKey = generateInstanceKey();
    const plaintext = "same envelope data";
    const blob1 = encryptForStorage(plaintext, instanceKey);
    const blob2 = encryptForStorage(plaintext, instanceKey);
    expect(blob1).not.toBe(blob2);
  });
});
