import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// Check if the pre-signed URL is still valid. If not, get a new one.
// Url contains the information below as search params
// X-Amz-Date=20260326T193627Z&X-Amz-Expires=300
export function isPreSignedURLStillValid(uploadUrl: string): boolean {
  const ONE_MINUTE_IN_MS = 60 * 1000;

  const uploadUrlObj = new URL(uploadUrl);
  const signDate = uploadUrlObj.searchParams.get("X-Amz-Date");
  const expires = uploadUrlObj.searchParams.get("X-Amz-Expires");
  if (!signDate || !expires) {
    throw new Error("Invalid pre-signed URL: missing required parameters");
  }
  const signDateTime = new Date(
    Date.UTC(
      parseInt(signDate.substring(0, 4), 10), // year
      parseInt(signDate.substring(4, 6), 10) - 1, // month (0-based)
      parseInt(signDate.substring(6, 8), 10), // day
      parseInt(signDate.substring(9, 11), 10), // hour
      parseInt(signDate.substring(11, 13), 10), // minute
      parseInt(signDate.substring(13, 15), 10), // second
    ),
  );

  return (
    Date.now() <
    signDateTime.getTime() + parseInt(expires, 10) * 1000 - ONE_MINUTE_IN_MS
  );
}
