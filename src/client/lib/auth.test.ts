import { describe, expect, test } from "bun:test";
import { loginSchema } from "../../shared/schemas/auth.ts";
import { safeRedirect } from "./auth.ts";

describe("safeRedirect", () => {
  test("Pfade dieser Seite bleiben, mit Suchparametern", () => {
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/aufgaben?page=2")).toBe("/aufgaben?page=2");
  });

  test("fremde Ziele und leere Angaben führen zur Startseite", () => {
    for (const target of [
      undefined,
      "",
      "https://example.com",
      "//example.com",
      "/\\example.com",
    ]) {
      expect(safeRedirect(target)).toBe("/");
    }
  });
});

describe("Login-Schema im Formular", () => {
  // Dasselbe Schema prüft der Server in POST /api/auth/login.
  test("liefert die Feldfehler, die das Formular am Feld zeigt", () => {
    const result = loginSchema.safeParse({ email: "keine-mail", password: "" });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((issue) => issue.path.join("."));
    expect(fields).toEqual(["email", "password"]);
  });
});
