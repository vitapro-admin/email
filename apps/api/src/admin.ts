import { DirectoryError, PERMISSION_GROUPS } from "@aquapro/directory";
import type { Access, Directory } from "@aquapro/directory";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const STATUS: Record<DirectoryError["code"], number> = {
  forbidden: 403,
  "not-found": 404,
  conflict: 409,
  invalid: 400,
  "last-superadmin": 409,
  "self-action": 409,
};

const id = z.coerce.number().int().positive();
const text = z.string().max(200);
const optionalText = z.string().max(200).nullable().optional();
const optionalId = z.number().int().positive().nullable().optional();

const userBody = z.object({
  login: z.string().min(1).max(100),
  email: z.string().min(3).max(200),
  titleBefore: optionalText,
  firstName: text,
  lastName: text,
  titleAfter: optionalText,
  position: optionalText,
  phone: optionalText,
  landline: optionalText,
  departmentId: optionalId,
  branchId: optionalId,
  roleIds: z.array(z.number().int().positive()).max(20),
});

const userPatch = userBody.omit({ login: true }).partial();
const roleBody = z.object({
  name: text,
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().max(60)).max(100),
});
const rolePatch = roleBody.partial();
const itemKind = z.enum(["departments", "branches"]);

type Defined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

/** Drops undefined values, so optional fields stay absent (exactOptionalPropertyTypes). */
function defined<T extends object>(value: T): Defined<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Defined<T>;
}

const body = (reply: FastifyReply, code: string, message: string, status: number) =>
  reply.code(status).send({ error: { code, message } });

/**
 * User, role and list administration. All permission rules live in `Directory`; the routes only
 * check the input and translate directory errors to HTTP answers.
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  directory: Directory,
  accessOf: (req: FastifyRequest) => Access,
): void {
  const handle = async <T>(reply: FastifyReply, run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof DirectoryError)
        return body(reply, error.code, error.message, STATUS[error.code]);
      throw error;
    }
  };
  const invalid = (reply: FastifyReply) => body(reply, "invalid", "Neplatné údaje.", 400);
  const canSee = (req: FastifyRequest) => {
    const a = accessOf(req);
    return a.permissions.has("users:view") || a.permissions.has("users:manage");
  };
  const deny = (reply: FastifyReply) =>
    body(reply, "forbidden", "Na túto akciu nemáte oprávnenie.", 403);

  app.get("/api/admin/permissions", async (req, reply) =>
    canSee(req) ? { groups: PERMISSION_GROUPS } : deny(reply),
  );

  // ---- users
  app.get("/api/admin/users", async (req, reply) => {
    if (!canSee(req)) return deny(reply);
    const q = z
      .object({
        search: z.string().max(100).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        roleId: id.optional(),
      })
      .safeParse(req.query);
    if (!q.success) return invalid(reply);
    return { users: await directory.listUsers(defined(q.data)) };
  });

  app.post("/api/admin/users", async (req, reply) => {
    const parsed = userBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply);
    return handle(reply, async () => ({
      user: await directory.createUser(accessOf(req), defined(parsed.data)),
    }));
  });

  app.patch("/api/admin/users/:id", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    const parsed = userPatch.safeParse(req.body);
    if (!p.success || !parsed.success) return invalid(reply);
    return handle(reply, async () => ({
      user: await directory.updateUser(accessOf(req), p.data, defined(parsed.data)),
    }));
  });

  app.post("/api/admin/users/:id/status", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    const parsed = z.object({ status: z.enum(["active", "disabled"]) }).safeParse(req.body);
    if (!p.success || !parsed.success) return invalid(reply);
    return handle(reply, async () => ({
      user: await directory.setStatus(accessOf(req), p.data, parsed.data.status),
    }));
  });

  app.put("/api/admin/users/:id/photo", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    if (!p.success || !Buffer.isBuffer(req.body)) return invalid(reply);
    return handle(reply, async () => {
      await directory.setPhoto(accessOf(req), p.data, req.body as Buffer);
      return { ok: true };
    });
  });

  app.delete("/api/admin/users/:id/photo", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    if (!p.success) return invalid(reply);
    return handle(reply, async () => {
      await directory.removePhoto(accessOf(req), p.data);
      return { ok: true };
    });
  });

  // Any signed-in colleague may see a profile photo (it is shown across the app).
  app.get("/api/users/:id/photo", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    if (!p.success) return invalid(reply);
    const photo = await directory.getPhoto(p.data);
    if (!photo) return body(reply, "not-found", "Fotografia neexistuje.", 404);
    return reply
      .header("Content-Type", photo.contentType)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=300")
      .send(photo.data);
  });

  // ---- roles
  app.get("/api/admin/roles", async (req, reply) =>
    canSee(req) ? { roles: await directory.listRoles() } : deny(reply),
  );

  app.post("/api/admin/roles", async (req, reply) => {
    const parsed = roleBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply);
    return handle(reply, async () => ({
      role: await directory.createRole(accessOf(req), defined(parsed.data)),
    }));
  });

  app.patch("/api/admin/roles/:id", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    const parsed = rolePatch.safeParse(req.body);
    if (!p.success || !parsed.success) return invalid(reply);
    return handle(reply, async () => ({
      role: await directory.updateRole(accessOf(req), p.data, defined(parsed.data)),
    }));
  });

  app.delete("/api/admin/roles/:id", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    if (!p.success) return invalid(reply);
    return handle(reply, async () => {
      await directory.deleteRole(accessOf(req), p.data);
      return { ok: true };
    });
  });

  // ---- departments and branches (read by every signed-in user, changed by user managers)
  app.get("/api/lists/:kind", async (req, reply) => {
    const kind = itemKind.safeParse((req.params as { kind: string }).kind);
    if (!kind.success) return invalid(reply);
    return { items: await directory.listItems(kind.data) };
  });

  app.post("/api/admin/lists/:kind", async (req, reply) => {
    const kind = itemKind.safeParse((req.params as { kind: string }).kind);
    const parsed = z.object({ name: text }).safeParse(req.body);
    if (!kind.success || !parsed.success) return invalid(reply);
    return handle(reply, async () => ({
      item: await directory.createItem(accessOf(req), kind.data, parsed.data.name),
    }));
  });

  app.patch("/api/admin/lists/:kind/:id", async (req, reply) => {
    const params = req.params as { kind: string; id: string };
    const kind = itemKind.safeParse(params.kind);
    const p = id.safeParse(params.id);
    const parsed = z
      .object({ name: text.optional(), active: z.boolean().optional() })
      .safeParse(req.body);
    if (!kind.success || !p.success || !parsed.success) return invalid(reply);
    return handle(reply, async () => ({
      item: await directory.updateItem(accessOf(req), kind.data, p.data, defined(parsed.data)),
    }));
  });

  // ---- audit log
  app.get("/api/admin/audit", async (req, reply) => {
    const q = z
      .object({
        limit: id.optional(),
        beforeId: id.optional(),
        action: z.string().max(60).optional(),
      })
      .safeParse(req.query);
    if (!q.success) return invalid(reply);
    return handle(reply, async () => ({
      entries: await directory.listAudit(accessOf(req), defined(q.data)),
    }));
  });
}
