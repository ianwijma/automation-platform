import type { ArtifactStore } from "../api/artifacts.js";
import type { ArtifactRef } from "../core/node-contract.js";

export class ArtifactStoreHandle {
  private _store: ArtifactStore;
  private _runId: string;

  constructor(store: ArtifactStore, runId: string) {
    this._store = store;
    this._runId = runId;
  }

  async read(ref: ArtifactRef): Promise<Uint8Array> {
    const result = this._store.getArtifact(ref.$artifact);
    if (!result)
      throw new Error(`Artifact expired or unavailable: ${ref.$artifact}`);
    return new Uint8Array(result.data);
  }

  async store(
    data: ArrayBuffer | Uint8Array,
    mime: string,
    name: string,
    ttlHours?: number,
  ): Promise<ArtifactRef> {
    const buf =
      data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(data);
    const meta = this._store.storeArtifact(
      buf,
      mime,
      name,
      this._runId,
      ttlHours,
    );
    return {
      $artifact: meta.id,
      mime: meta.mime,
      size: meta.size,
      name: meta.name,
    };
  }
}
