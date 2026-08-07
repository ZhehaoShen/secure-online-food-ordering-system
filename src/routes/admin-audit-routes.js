import { createAdminAuditController } from "../controllers/admin-audit-controller.js";
import {
  requireAdministrator,
  requireAuthentication,
} from "../middleware/authentication.js";

export function registerAdminAuditRoutes(app, { auditRepository }) {
  const controller = createAdminAuditController(auditRepository);

  app.get(
    "/admin/audit-logs",
    requireAuthentication,
    requireAdministrator,
    controller.list,
  );
}
