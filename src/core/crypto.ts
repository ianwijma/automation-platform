import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from "node:crypto";

export function generateInstanceKey(): Buffer {
  return randomBytes(32);
}

export function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, salt, "automation-platform-key", 32));
}

export function encryptData(
  data: string,
  key: Buffer,
): { encrypted: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptData(
  encrypted: string,
  iv: string,
  tag: string,
  key: Buffer,
): string {
  const ivBuf = Buffer.from(iv, "base64");
  const tagBuf = Buffer.from(tag, "base64");
  const encBuf = Buffer.from(encrypted, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, ivBuf);
  decipher.setAuthTag(tagBuf);
  const decrypted = Buffer.concat([decipher.update(encBuf), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptForStorage(
  data: string,
  instanceKey: Buffer,
): string {
  const dataKey = randomBytes(32);
  const { encrypted: encData, iv, tag } = encryptData(data, dataKey);
  const {
    encrypted: encDataKey,
    iv: dataKeyIv,
    tag: dataKeyTag,
  } = encryptData(dataKey.toString("base64"), instanceKey);
  return JSON.stringify({ encDataKey, encData, iv, tag, dataKeyIv, dataKeyTag });
}

export function decryptFromStorage(
  blob: string,
  instanceKey: Buffer,
): string {
  const envelope = JSON.parse(blob) as {
    encDataKey: string;
    encData: string;
    iv: string;
    tag: string;
    dataKeyIv: string;
    dataKeyTag: string;
  };
  const dataKeyB64 = decryptData(
    envelope.encDataKey,
    envelope.dataKeyIv,
    envelope.dataKeyTag,
    instanceKey,
  );
  const dataKey = Buffer.from(dataKeyB64, "base64");
  return decryptData(envelope.encData, envelope.iv, envelope.tag, dataKey);
}
