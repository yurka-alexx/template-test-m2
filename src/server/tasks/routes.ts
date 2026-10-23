import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type Task,
  type TaskList,
  taskCreateSchema,
  taskListQuerySchema,
  taskUpdateSchema,
} from "../../shared/schemas/task.ts";
import type { PublicUser } from "../../shared/schemas/user.ts";
import { type AuthEnv, requireAuth, requireRole } from "../auth/middleware.ts";
import type { Db } from "../db/index.ts";
import { validator } from "../validator.ts";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "./tasks.ts";

const uuidSchema = z.uuid();
const notFound = () => new HTTPException(404, { message: "Aufgabe nicht gefunden" });

/** `:id` aus dem Pfad. Keine gültige UUID heißt: diese Aufgabe gibt es nicht (404). */
function taskId(c: Context): string {
  const id = c.req.param("id");
  if (!uuidSchema.safeParse(id).success) throw notFound();
  return id as string;
}

/**
 * Routen unter `/api/tasks`, alle nur mit Anmeldung. Lesen, Anlegen und Ändern dürfen
 * `admin` und `benutzer`, Löschen nur `admin`. `loadSession` muss davor laufen.
 */
export function taskRoutes(db: Db) {
  return new Hono<AuthEnv>()
    .use("*", requireAuth)
    .get("/", validator("query", taskListQuerySchema), async (c) => {
      const list = await listTasks(db, c.req.valid("query"));
      return c.json<TaskList, 200>(list, 200);
    })
    .get("/:id", async (c) => {
      const task = await getTask(db, taskId(c));
      if (!task) throw notFound();
      return c.json<{ task: Task }, 200>({ task }, 200);
    })
    .post("/", validator("json", taskCreateSchema), async (c) => {
      // requireAuth stellt sicher, dass user gesetzt ist.
      const user = c.get("user") as PublicUser;
      const task = await createTask(db, c.req.valid("json"), user.id);
      return c.json<{ task: Task }, 201>({ task }, 201);
    })
    .patch("/:id", validator("json", taskUpdateSchema), async (c) => {
      const task = await updateTask(db, taskId(c), c.req.valid("json"));
      if (!task) throw notFound();
      return c.json<{ task: Task }, 200>({ task }, 200);
    })
    .delete("/:id", requireRole("admin"), async (c) => {
      if (!(await deleteTask(db, taskId(c)))) throw notFound();
      return c.body(null, 204);
    });
}
