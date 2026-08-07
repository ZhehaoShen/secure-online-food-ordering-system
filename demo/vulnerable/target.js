const TARGET_QUERY = Object.freeze({
  name: "vulnerable-demo-target-check",
  text: `
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      data_classification,
      environment_marker
    FROM vulnerable_demo_environment
    WHERE singleton = true
    LIMIT 1
  `,
});

export class VulnerableDemoTargetError extends Error {
  constructor() {
    super("The vulnerable demo database target was rejected.");
    this.name = "VulnerableDemoTargetError";
    this.code = "VULNERABLE_DEMO_TARGET_REJECTED";
  }
}

export async function verifyVulnerableDemoTarget(pool, config) {
  if (!pool || typeof pool.query !== "function" || !config?.database) {
    throw new VulnerableDemoTargetError();
  }

  let marker;

  try {
    const result = await pool.query({ ...TARGET_QUERY });
    marker = result.rows[0];
  } catch {
    throw new VulnerableDemoTargetError();
  }

  if (
    marker?.database_name !== config.database.database ||
    marker?.database_user !== config.database.user ||
    marker?.data_classification !== config.dataClassification ||
    marker?.environment_marker !== config.databaseMarker
  ) {
    throw new VulnerableDemoTargetError();
  }

  return true;
}
