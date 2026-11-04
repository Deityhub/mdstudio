// Vite aliases this module to node-mail.stub.ts for the Workers build, so nodemailer and node:fs
// stay out of the Worker bundle.
export { createNodeMailer } from "./mail/node";
