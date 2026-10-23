import { describe, expect, test } from "bun:test";
import { ApiError } from "./api.ts";
import { formErrorsFrom } from "./form-errors.ts";

const loginFields = ["email", "password"] as const;

describe("formErrorsFrom", () => {
  test("Feldfehler der API landen am Feld, ohne allgemeine Meldung", () => {
    const error = new ApiError(400, "Ungültige Eingabe", {
      email: ["muss eine gültige E-Mail-Adresse sein", "zweite Meldung"],
    });
    expect(formErrorsFrom(error, loginFields)).toEqual({
      fields: { email: "muss eine gültige E-Mail-Adresse sein" },
      root: undefined,
    });
  });

  test("falsche Zugangsdaten (401) werden allgemeine Meldung", () => {
    const error = new ApiError(401, "E-Mail oder Passwort falsch");
    expect(formErrorsFrom(error, loginFields)).toEqual({
      fields: {},
      root: "E-Mail oder Passwort falsch",
    });
  });

  test("Feldfehler zu unbekannten Feldern ergeben zusätzlich die allgemeine Meldung", () => {
    const error = new ApiError(400, "Ungültige Eingabe", {
      password: ["fehlt"],
      _root: ["kaputt"],
    });
    expect(formErrorsFrom(error, loginFields)).toEqual({
      fields: { password: "fehlt" },
      root: "Ungültige Eingabe",
    });
  });

  test("andere Fehler ergeben eine allgemeine Meldung", () => {
    expect(formErrorsFrom(new Error("x"), loginFields)).toEqual({
      fields: {},
      root: "Unerwarteter Fehler",
    });
    expect(formErrorsFrom(new ApiError(0, "Server nicht erreichbar"), loginFields).root).toBe(
      "Server nicht erreichbar",
    );
  });
});
