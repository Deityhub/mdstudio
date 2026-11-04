export type Mail = { to: string; subject: string; text: string };
export type Mailer = (mail: Mail) => Promise<void>;
