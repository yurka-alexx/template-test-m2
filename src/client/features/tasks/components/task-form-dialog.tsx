import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formErrorsFrom } from "@/lib/form-errors";
import {
  type Task,
  type TaskCreate,
  taskPriorities,
  taskStatuses,
} from "../../../../shared/schemas/task.ts";
import { createTask, tasksQueryKey, updateTask } from "../api.ts";
import {
  type TaskFormField,
  type TaskFormValues,
  taskCreateFormSchema,
  taskFormDefaults,
  taskFormFields,
  taskUpdateFormSchema,
} from "../form.ts";
import { taskPriorityLabels, taskStatusLabels } from "../labels.ts";

/**
 * Dialog „Neue Aufgabe“ bzw. „Aufgabe bearbeiten“ (mit `task`). Der Inhalt wird bei jedem
 * Öffnen neu aufgebaut, das Formular startet also immer mit den aktuellen Werten. Der `key`
 * baut es auch neu auf, wenn während der Schließ-Animation eine andere Aufgabe geöffnet wird.
 */
export function TaskFormDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle>
          <DialogDescription>
            {task ? "Änderungen speichern oder abbrechen." : "Pflichtfeld ist nur der Titel."}
          </DialogDescription>
        </DialogHeader>
        <TaskForm key={task?.id ?? "neu"} task={task} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({ task, onSaved }: { task?: Task; onSaved: () => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  // Beide Schemas haben dieselbe Ausgabe-Form, PATCH bekommt alle Felder.
  const resolver = (
    task ? zodResolver(taskUpdateFormSchema) : zodResolver(taskCreateFormSchema)
  ) as Resolver<TaskFormValues, unknown, TaskCreate>;
  const form = useForm<TaskFormValues, unknown, TaskCreate>({
    resolver,
    defaultValues: taskFormDefaults(task),
  });
  const { errors } = form.formState;

  const saveMutation = useMutation({
    mutationFn: (input: TaskCreate) => (task ? updateTask(task.id, input) : createTask(input)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      onSaved();
    },
    onError: (error) => {
      const { fields, root } = formErrorsFrom(error, taskFormFields);
      for (const name of taskFormFields) {
        const message = fields[name];
        if (message) form.setError(name, { type: "server", message });
      }
      if (root) form.setError("root.server", { type: "server", message: root });
    },
  });

  const onSubmit = form.handleSubmit((values) => saveMutation.mutate(values));
  const rootError = errors.root?.server?.message;
  const fieldId = (name: TaskFormField) => `${id}-${name}`;
  const errorProps = (name: TaskFormField) =>
    errors[name]
      ? { "aria-invalid": true, "aria-describedby": `${fieldId(name)}-error` }
      : undefined;
  const fieldError = (name: TaskFormField) =>
    errors[name] && (
      <p id={`${fieldId(name)}-error`} className="text-destructive text-sm">
        {errors[name]?.message}
      </p>
    );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {rootError && (
        <p role="alert" className="text-destructive text-sm">
          {rootError}
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor={fieldId("title")}>Titel</Label>
        <Input id={fieldId("title")} {...errorProps("title")} {...form.register("title")} />
        {fieldError("title")}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fieldId("description")}>Beschreibung</Label>
        <Textarea
          id={fieldId("description")}
          rows={3}
          {...errorProps("description")}
          {...form.register("description")}
        />
        {fieldError("description")}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={fieldId("status")}>Status</Label>
          <NativeSelect
            id={fieldId("status")}
            className="w-full"
            {...errorProps("status")}
            {...form.register("status")}
          >
            {taskStatuses.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {taskStatusLabels[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {fieldError("status")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={fieldId("priority")}>Priorität</Label>
          <NativeSelect
            id={fieldId("priority")}
            className="w-full"
            {...errorProps("priority")}
            {...form.register("priority")}
          >
            {taskPriorities.map((priority) => (
              <NativeSelectOption key={priority} value={priority}>
                {taskPriorityLabels[priority]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {fieldError("priority")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={fieldId("dueDate")}>Fällig am</Label>
          <Input
            id={fieldId("dueDate")}
            type="date"
            {...errorProps("dueDate")}
            {...form.register("dueDate")}
          />
          {fieldError("dueDate")}
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Abbrechen
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saveMutation.isPending}>
          Speichern
        </Button>
      </DialogFooter>
    </form>
  );
}
