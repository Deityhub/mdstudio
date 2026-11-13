import { type Mail, getMailer } from ".";

/** Mail is best effort: a missing provider or a failure never undoes what the person did. */
export async function sendQuietly(request: Request, mail: Mail) {
  try {
    const mailer = await getMailer(request);
    if (!mailer) return false;
    await mailer(mail);
    return true;
  } catch (error) {
    console.error("Couldn't send an email", error);
    return false;
  }
}
