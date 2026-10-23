import { describe, expect, test } from "bun:test";
import { nextSearchText } from "./tasks-toolbar.tsx";

describe("nextSearchText", () => {
  test("Echo der eigenen Suche: inzwischen getippte Zeichen bleiben im Feld", () => {
    // „ab“ gesendet, „c“ getippt, bevor die Adresszeile mit q=ab zurückkommt.
    expect(nextSearchText("abc", "ab", "ab")).toBe("abc");
  });

  test("Wert von außen wird übernommen (Zurücksetzen, Zurück im Browser)", () => {
    expect(nextSearchText("abc", "", "abc")).toBe("");
    expect(nextSearchText("abc", "Bericht", undefined)).toBe("Bericht");
    expect(nextSearchText("abc", "ab", undefined)).toBe("ab");
  });

  test("gleicher Suchtext bleibt unverändert, auch mit Leerzeichen am Ende", () => {
    expect(nextSearchText("Bericht ", "Bericht", undefined)).toBe("Bericht ");
  });
});
