import nodemailer from "nodemailer";
import { getRequiredEnvironmentVariable } from "@/lib/utils";

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const transporter = getEmailTransport();

  await transporter.sendMail({
    from: getMailFromAddress(),
    to,
    subject,
    text,
    html,
  });
}

function getEmailTransport() {
  return nodemailer.createTransport({
    host: getEmailHost(),
    port: getEmailPort(),
    secure: getEmailSecure(),
    auth: getEmailAuth(),
  });
}

function getMailFromAddress() {
  return process.env.MAIL_FROM ?? "HR App <noreply@example.test>";
}

function getEmailHost() {
  if (process.env.EMAIL_SMTP_HOST) {
    return process.env.EMAIL_SMTP_HOST;
  }

  if (process.env.NODE_ENV === "development") {
    return "127.0.0.1";
  }

  return getRequiredEnvironmentVariable("EMAIL_SMTP_HOST");
}

function getEmailPort() {
  const configuredPort = process.env.EMAIL_SMTP_PORT;

  if (!configuredPort) {
    return process.env.NODE_ENV === "development" ? 1025 : 587;
  }

  const parsedPort = Number.parseInt(configuredPort, 10);

  if (Number.isNaN(parsedPort)) {
    throw new Error(`Invalid EMAIL_SMTP_PORT: ${configuredPort}`);
  }

  return parsedPort;
}

function getEmailSecure() {
  return process.env.EMAIL_SMTP_SECURE === "true";
}

function getEmailAuth() {
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASSWORD;

  if (!user || !pass) {
    return undefined;
  }

  return { user, pass };
}
