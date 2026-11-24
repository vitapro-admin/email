import { TaskError } from "@aquapro/tasks";
import type { TaskService } from "@aquapro/tasks";
import type { Access } from "@aquapro/directory";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const STATUS: Record<TaskError["code"], number> = {
  forbidden: 403,
  "not-found": 404,
  invalid: 400,
};

const id = z.coerce.number().int().positive();
/** How often new CRM events are turned into tasks when somebody opens the list. */
const ADOPT_EVERY_MS = 30_000;

/** Task list and detail. Visibility rules live in `TaskService`; the routes only check input. */
export function registerTaskRoutes(
  app: FastifyInstance,
  tasks: TaskService,
  accessOf: (req: FastifyRequest) => Access,
  now: () => number,
): void {
  let lastAdopt = 0;

  const handle = async <T>(reply: FastifyReply, run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof TaskError) {
        return reply
          .code(STATUS[error.code])
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  };
  const invalid = (reply: FastifyReply) =>
    reply.code(400).send({ error: { code: "invalid", message: "Neplatné údaje." } });

  app.get("/api/tasks", async (req, reply) => {
    const q = z
      .object({
        search: z.string().max(100).optional(),
        scope: z.enum(["all", "mine", "unassigned"]).optional(),
      })
      .safeParse(req.query);
    if (!q.success) return invalid(reply);
    return handle(reply, async () => {
      if (now() - lastAdopt > ADOPT_EVERY_MS) {
        lastAdopt = now();
        await tasks.adoptEvents();
      }
      return {
        tasks: await tasks.list(accessOf(req), {
          ...(q.data.search ? { search: q.data.search } : {}),
          ...(q.data.scope ? { scope: q.data.scope } : {}),
        }),
      };
    });
  });

  app.get("/api/tasks/:id", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    if (!p.success) return invalid(reply);
    return handle(reply, async () => ({ task: await tasks.get(accessOf(req), p.data) }));
  });

  app.post("/api/tasks", async (req, reply) => {
    const body = z
      .object({
        title: z.string().max(200),
        ownerId: z.number().int().positive().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return invalid(reply);
    return handle(reply, async () => ({
      task: await tasks.createLocal(accessOf(req), {
        title: body.data.title,
        ...(body.data.ownerId ? { ownerId: body.data.ownerId } : {}),
      }),
    }));
  });

  app.post("/api/tasks/:id/assign", async (req, reply) => {
    const p = id.safeParse((req.params as { id: string }).id);
    const body = z.object({ ownerId: z.number().int().positive().nullable() }).safeParse(req.body);
    if (!p.success || !body.success) return invalid(reply);
    return handle(reply, async () => ({
      task: await tasks.assign(accessOf(req), p.data, body.data.ownerId),
    }));
  });

  app.get("/api/task-assignees", async (req, reply) =>
    handle(reply, async () => ({ users: await tasks.assignees(accessOf(req)) })),
  );
}
