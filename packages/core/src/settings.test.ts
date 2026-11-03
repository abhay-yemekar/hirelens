import { describe, expect, it } from "vitest";
import { readSetting } from "./settings.js";

describe("readSetting", () => {
  it("reads the new CANDIDLENS_ name", () => {
    expect(readSetting("LLM_MODEL", { CANDIDLENS_LLM_MODEL: "m-new" })).toBe("m-new");
  });

  it("falls back to the old HIRELENS_ name", () => {
    expect(readSetting("LLM_MODEL", { HIRELENS_LLM_MODEL: "m-old" })).toBe("m-old");
  });

  it("prefers the new name when both are set", () => {
    const env = { CANDIDLENS_LLM_MODEL: "m-new", HIRELENS_LLM_MODEL: "m-old" };
    expect(readSetting("LLM_MODEL", env)).toBe("m-new");
  });

  it("treats an empty new value as unset, as Docker Compose passes unset variables", () => {
    const env = { CANDIDLENS_LLM_MODEL: "", HIRELENS_LLM_MODEL: "m-old" };
    expect(readSetting("LLM_MODEL", env)).toBe("m-old");
  });

  it("returns undefined when neither name is set", () => {
    expect(readSetting("LLM_MODEL", {})).toBeUndefined();
  });
});
