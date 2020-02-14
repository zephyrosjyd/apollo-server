import { URL, format } from 'url';
import { Request, Response } from 'apollo-server-env';
import { InMemoryLRUCache } from 'apollo-server-caching';

const MAX_MEM_SIZE = 5 * 1024 * 1024; // 5MB

function cacheKey(request: Request) {
  const parsed = new URL(request.url);
  const key = `gateway:request-cache:${format({
    protocol: parsed.protocol,
    slashes: true,
    port: parsed.port,
    hostname: parsed.hostname,
    pathname: parsed.pathname,
  })}`;
  return key;
}

export class Cache {
  constructor(
    public cache: InMemoryLRUCache<Response> = new InMemoryLRUCache({
      maxSize: MAX_MEM_SIZE,
    }),
  ) {}

  // Return true if entry exists, else false
  async delete(request: Request) {
    const key = cacheKey(request);
    const entry = await this.cache.get(key);
    await this.cache.delete(key);
    return Boolean(entry);
  }

  async put(request: Request, response: Response) {
    return this.cache.set(cacheKey(request), response);
  }

  async match(request: Request) {
    const result = this.cache.get(cacheKey(request));
    return result;
  }
}
