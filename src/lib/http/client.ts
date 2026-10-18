/** Parse API errors without exposing an upstream HTML/proxy error page. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function readJsonResponse<T>(response: Response): Promise<T> {
  let data: { message?: string };
  try {
    data = await response.json();
  } catch {
    throw new ApiRequestError(
      "Server belum memberikan respons yang valid. Periksa koneksi, lalu muat ulang data sebelum mengulangi penyimpanan.",
      response.status,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new ApiRequestError(
      "Respons server tidak valid. Muat ulang data sebelum mencoba lagi.",
      response.status,
    );
  if (!response.ok)
    throw new ApiRequestError(
      data?.message || "Permintaan belum berhasil. Silakan coba kembali.",
      response.status,
    );
  return data as T;
}
export async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  return readJsonResponse<T>(response);
}
