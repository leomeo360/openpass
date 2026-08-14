export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function requestId(): string {
  return `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function apiError(error: ApiError, id: string): Response {
  return json({ error: { code: error.code, message: error.message, request_id: id } }, error.status, {
    "x-request-id": id,
  });
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const raw = await readTextBody(request, maxBytes);
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiError(400, "INVALID_REQUEST", "The request body must be a JSON object.");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_REQUEST", "The request body must be valid JSON.");
  }
}

export async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(400, "INVALID_REQUEST", `Request body exceeds ${maxBytes} bytes.`);
  }
  if (!request.body) throw new ApiError(400, "INVALID_REQUEST", "A request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ApiError(400, "INVALID_REQUEST", `Request body exceeds ${maxBytes} bytes.`);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return new TextDecoder().decode(concat(chunks, size));
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function maskIp(ip: string): string {
  if (ip.includes(":")) {
    const address = ip.split("%", 1)[0].toLowerCase();
    if (address.includes(":::") || address.indexOf("::") !== address.lastIndexOf("::")) return "";
    const [leftText, rightText = ""] = address.split("::", 2);
    const left = leftText ? leftText.split(":").filter(Boolean) : [];
    const right = rightText ? rightText.split(":").filter(Boolean) : [];
    const missing = address.includes("::") ? Math.max(0, 8 - left.length - right.length) : 0;
    const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
    if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return "";
    const prefix = groups.slice(0, 3).map((group) => Number.parseInt(group, 16).toString(16));
    return prefix.every((group) => group === "0") ? "::/48" : `${prefix.join(":")}::/48`;
  }
  const parts = ip.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
    ? `${Number(parts[0])}.${Number(parts[1])}.${Number(parts[2])}.0/24`
    : "";
}
