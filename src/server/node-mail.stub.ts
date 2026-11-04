/** On Workers mail goes out through Resend's HTTP API; SMTP and the file outbox are Node only. */
export const createNodeMailer = (_env: Record<string, string | undefined>) => null;
