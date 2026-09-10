// Chrome native messaging framing: 4-byte little-endian length + UTF-8 JSON, both directions.
import { EventEmitter } from "node:events";

export class NativePort extends EventEmitter {
  constructor(input = process.stdin, output = process.stdout) {
    super();
    this.output = output;
    let buf = Buffer.alloc(0);
    input.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32LE(0);
        if (buf.length < 4 + len) break;
        const body = buf.subarray(4, 4 + len).toString("utf8");
        buf = buf.subarray(4 + len);
        try { this.emit("message", JSON.parse(body)); } catch (e) { this.emit("error", e); }
      }
    });
    input.on("end", () => this.emit("close"));
    input.on("close", () => this.emit("close"));
  }
  send(msg) {
    const body = Buffer.from(JSON.stringify(msg), "utf8");
    if (body.length > 1024 * 1024) throw new Error("native message over 1MB");
    const head = Buffer.alloc(4);
    head.writeUInt32LE(body.length, 0);
    this.output.write(Buffer.concat([head, body]));
  }
}
