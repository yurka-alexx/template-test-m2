import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import type { Task } from "../../../../shared/schemas/task.ts";
import { deleteTask, tasksQueryKey } from "../api.ts";
import { deleteErrorMessage } from "../labels.ts";

/**
 * Bestätigung vor dem Löschen. „Abbrechen“ schließt nur den Dialog, gelöscht wird erst mit
 * „Löschen“. Lehnt die API ab (etwa 403), bleibt der Dialog offen und zeigt die Meldung.
 */
export function TaskDeleteDialog({
  task,
  open,
  onOpenChange,
}: {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      onOpenChange(false);
    },
    onError: async (error) => {
      // Schon gelöscht: Liste neu laden, damit die Zeile verschwindet.
      if (error instanceof ApiError && error.status === 404) {
        await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      }
    },
  });

  const changeOpen = (open: boolean) => {
    if (!open) deleteMutation.reset();
    onOpenChange(open);
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Aufgabe löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            „{task.title}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteMutation.isError && (
          <p role="alert" className="text-destructive text-sm">
            {deleteErrorMessage(deleteMutation.error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(task.id)}
          >
            Löschen
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
