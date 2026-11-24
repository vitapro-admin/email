import { describe, expect, it } from "vitest";
import { MAX_FILES, MAX_TOTAL_BYTES, checkLocalFile } from "./attachments";

describe("checkLocalFile", () => {
  it("accepts ordinary files", () => {
    expect(checkLocalFile({ name: "cenník.pdf", size: 1000 }, [])).toBeNull();
    expect(checkLocalFile({ name: "exe-navod.pdf", size: 10 }, [])).toBeNull();
    expect(checkLocalFile({ name: "faktura.exe.pdf", size: 10 }, [])).toBeNull();
  });

  it.each(["program.exe", "SKRIPT.JS", "faktura.pdf.exe", "x.bat"])("refuses %s", (name) => {
    expect(checkLocalFile({ name, size: 10 }, [])).toMatch(/bezpečnostných/);
  });

  it("refuses empty files and files over the total limit", () => {
    expect(checkLocalFile({ name: "a.txt", size: 0 }, [])).toMatch(/prázdny/);
    expect(checkLocalFile({ name: "a.zip", size: MAX_TOTAL_BYTES }, [{ size: 1 }])).toMatch(
      /nesmú presiahnuť/,
    );
    expect(checkLocalFile({ name: "a.zip", size: MAX_TOTAL_BYTES }, [])).toBeNull();
  });

  it("refuses too many files", () => {
    const many = Array.from({ length: MAX_FILES }, () => ({ size: 1 }));
    expect(checkLocalFile({ name: "a.txt", size: 1 }, many)).toMatch(/Príliš veľa/);
  });
});
