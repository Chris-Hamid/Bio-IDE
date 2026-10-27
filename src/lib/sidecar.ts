/**
 * Client for the Bio-IDE Python sidecar.
 * Uses WebSocket for primary communication.
 */

import type { SequenceRecord, SequenceStats, TranslationResult } from "../types/sequence";

const WS_URL = "ws://127.0.0.1:8741/ws";
const HTTP_URL = "http://127.0.0.1:8741";

type MessageHandler = (data: any) => void;

class SidecarClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: Function; reject: Function }>();
  private requestId = 0;
  private reconnectTimer: number | null = null;
  private onStatusChange?: (connected: boolean) => void;

  constructor() {
    this.connect();
  }

  setStatusCallback(cb: (connected: boolean) => void) {
    this.onStatusChange = cb;
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log("[sidecar] connected");
        this.onStatusChange?.(true);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onclose = () => {
        console.log("[sidecar] disconnected");
        this.onStatusChange?.(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error("[sidecar] error", err);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const id = data.id;
          if (id && this.pending.has(id)) {
            const { resolve, reject } = this.pending.get(id)!;
            this.pending.delete(id);
            if (data.type === "error") {
              reject(new Error(data.message || "Unknown error"));
            } else {
              resolve(data);
            }
          }
        } catch (e) {
          console.error("[sidecar] failed to parse message", e);
        }
      };
    } catch (e) {
      console.error("[sidecar] connection failed", e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  private send<T = any>(type: string, payload: any = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Sidecar not connected"));
        return;
      }

      const id = `req_${++this.requestId}`;
      this.pending.set(id, { resolve, reject });

      this.ws.send(JSON.stringify({ type, id, payload }));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Request timed out"));
        }
      }, 30000);
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.send("ping");
      return true;
    } catch {
      return false;
    }
  }

  async parse(content: string, format: "genbank" | "fasta"): Promise<SequenceRecord[]> {
    const res = await this.send("parse", { content, format });
    return res.records;
  }

  async reverseComplement(record: SequenceRecord): Promise<SequenceRecord> {
    const res = await this.send("reverse_complement", { record });
    return res.record;
  }

  async translate(record: SequenceRecord): Promise<TranslationResult> {
    const res = await this.send("translate", { record });
    return res.translations;
  }

  async findRestrictionSites(
    record: SequenceRecord,
    enzymes?: string[]
  ): Promise<any[]> {
    const res = await this.send("find_restriction_sites", { record, enzymes });
    return res.sites;
  }

  async getStats(record: SequenceRecord): Promise<SequenceStats> {
    const res = await this.send("stats", { record });
    return res.stats;
  }

  async fetchFromNcbi(
    accession: string,
    email?: string
  ): Promise<SequenceRecord[]> {
    const res = await this.send("ncbi_fetch", {
      accession,
      email,
      rettype: "gb",
    });
    return res.records;
  }

  // Fallback HTTP helpers (useful when WebSocket is down)
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${HTTP_URL}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// Singleton
export const sidecar = new SidecarClient();
