import * as MultipartParser from "effect/http/MultipartParser";

/** Parses already bounded bytes without Bun's filename-based MIME inference. */
export function parseMultipart(headers: Headers, bytes: Uint8Array): FormData {
  const form = new FormData();
  let complete = false;
  const parser = MultipartParser.make({
    headers: Object.fromEntries(headers),
    maxTotalSize: bytes.byteLength,
    maxFieldSize: bytes.byteLength,
    isFile: (info) => info.filename !== undefined,
    onField: (info, value) => form.append(info.name, MultipartParser.decodeField(info, value)),
    onFile: (info) => {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      return (chunk) => {
        if (chunk !== null) chunks.push(new Uint8Array(chunk));
        else
          form.append(
            info.name,
            new File(chunks, info.filename ?? "blob", {
              type:
                typeof info.headers["content-type"] === "string"
                  ? info.headers["content-type"]
                  : info.contentType,
            }),
          );
      };
    },
    onError: (error) => {
      throw new Error("Invalid multipart body", { cause: error });
    },
    onDone: () => {
      complete = true;
    },
  });
  parser.write(bytes);
  parser.end();
  if (!complete) throw new Error("Incomplete multipart body");
  return form;
}
