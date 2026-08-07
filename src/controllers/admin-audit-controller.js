export function createAdminAuditController(auditRepository) {
  if (!auditRepository || typeof auditRepository.listAllForAdministration !== "function") {
    throw new TypeError("An audit repository is required.");
  }

  return Object.freeze({
    async list(request, response) {
      const page = request.query.page || 1;
      const result = await auditRepository.listAllForAdministration({ page, limit: 50 });

      response.render("admin-audit-logs", {
        pageTitle: "Audit Logs",
        activePath: "/admin/audit-logs",
        logs: result.logs,
        pagination: result.pagination,
      });
    },
  });
}
