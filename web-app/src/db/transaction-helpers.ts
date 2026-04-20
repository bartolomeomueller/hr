import { db } from ".";

const SERIALIZATION_FAILURE_ERROR_CODE = "40001";
const MAX_SERIALIZABLE_TRANSACTION_RETRIES = 3;

export async function runSerializableTransaction<T>(
  callback: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<T>,
) {
  for (
    let currentAttempt = 1;
    currentAttempt <= MAX_SERIALIZABLE_TRANSACTION_RETRIES;
    currentAttempt++
  ) {
    try {
      return await db.transaction(callback, {
        isolationLevel: "serializable",
      });
    } catch (error) {
      if (
        !isSerializationFailureError(error) ||
        currentAttempt >= MAX_SERIALIZABLE_TRANSACTION_RETRIES
      ) {
        console.error(
          "Error during serializable transaction, current attempt:",
          currentAttempt,
          error,
        );
        throw error;
      }
    }
  }

  throw new Error(
    "Invariant violation: serializable transaction retries should either return or throw the last serialization error.",
  );
}

function isSerializationFailureError(error: unknown) {
  let currentError: unknown = error;

  while (typeof currentError === "object" && currentError !== null) {
    if (
      "code" in currentError &&
      currentError.code === SERIALIZATION_FAILURE_ERROR_CODE
    ) {
      return true;
    }

    if (!("cause" in currentError)) {
      return false;
    }

    currentError = currentError.cause;
  }

  return false;
}
