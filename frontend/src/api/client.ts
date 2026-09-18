export async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`API request failed (${response.status})`);
    return response.json() as Promise<T>;
}
