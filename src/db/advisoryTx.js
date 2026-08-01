import mysql from "mysql2/promise";

const GET_LOCK_SQL = "SELECT GET_LOCK(?, ?) AS acquired";
const RELEASE_LOCK_SQL = "SELECT RELEASE_LOCK(?) AS released";

function createCodedError(code) {
  const error = new Error("Advisory lock operation failed.");
  error.code = code;
  return error;
}

function addCleanupWarning(cleanupWarnings, stage, code) {
  cleanupWarnings.push({ stage, code });
}

function attachCleanupWarnings(error, cleanupWarnings) {
  if (cleanupWarnings.length === 0) return;

  const canAttach = error !== null
    && (typeof error === "object" || typeof error === "function")
    && Object.isExtensible(error);

  if (!canAttach) return;

  try {
    error.cleanupWarnings = cleanupWarnings;
  } catch {}
}

export async function runWithAdvisoryLockTx({
  dbConfig,
  lockName,
  timeoutSeconds,
  work,
  createConnection = mysql.createConnection,
}) {
  const conn = await createConnection(dbConfig);
  const cleanupWarnings = [];
  let lockAcquired = false;
  let transactionStarted = false;
  let committed = false;
  let timedOut = false;
  let value;
  let hasPrimaryError = false;
  let primaryError;

  try {
    let rows;

    try {
      [rows] = await conn.execute(
        GET_LOCK_SQL,
        [lockName, timeoutSeconds],
      );
    } catch (error) {
      hasPrimaryError = true;
      primaryError = error;
    }

    if (!hasPrimaryError) {
      const acquired = rows?.[0]?.acquired;

      if (acquired === 1) {
        lockAcquired = true;
      } else if (acquired === 0) {
        timedOut = true;
      } else if (acquired === null) {
        hasPrimaryError = true;
        primaryError = createCodedError("advisory_lock_acquire_failed");
      } else {
        hasPrimaryError = true;
        primaryError = createCodedError("advisory_lock_unexpected_result");
      }
    }

    if (lockAcquired) {
      try {
        await conn.beginTransaction();
        transactionStarted = true;
        value = await work(conn);
        await conn.commit();
        committed = true;
      } catch (error) {
        hasPrimaryError = true;
        primaryError = error;

        if (transactionStarted && !committed) {
          try {
            await conn.rollback();
          } catch {
            addCleanupWarning(
              cleanupWarnings,
              "rollback",
              "transaction_rollback_failed",
            );
          }
        }
      }
    }
  } finally {
    if (lockAcquired) {
      try {
        const [rows] = await conn.execute(
          RELEASE_LOCK_SQL,
          [lockName],
        );

        if (rows?.[0]?.released !== 1) {
          addCleanupWarning(
            cleanupWarnings,
            "release_lock",
            "advisory_lock_release_failed",
          );
        }
      } catch {
        addCleanupWarning(
          cleanupWarnings,
          "release_lock",
          "advisory_lock_release_failed",
        );
      }
    }

    try {
      await conn.end();
    } catch {
      addCleanupWarning(
        cleanupWarnings,
        "connection_end",
        "connection_end_failed",
      );
    }
  }

  if (hasPrimaryError) {
    attachCleanupWarnings(primaryError, cleanupWarnings);
    throw primaryError;
  }

  if (timedOut) {
    return {
      acquired: false,
      reason: "timeout",
      cleanupWarnings,
    };
  }

  return {
    acquired: true,
    value,
    cleanupWarnings,
  };
}
