/** `text` is always sent; `html` is the designed version, for clients that show it. */
export type Mail = { to: string; subject: string; text: string; html?: string };
export type Mailer = (mail: Mail) => Promise<void>;

/**
 * A provider refused or failed to send. `status` is the HTTP status when there was one, which is how
 * the chain tells "full for today" (429) from "broken right now". Messages never carry the response
 * body or any key, because they end up in logs.
 */
export class ProviderError extends Error {
  status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}
