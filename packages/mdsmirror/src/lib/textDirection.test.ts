import { parser } from "../server";
import { firstStrongDir } from "./textDirection";

const dirOf = (md: string) => firstStrongDir(parser.parse(md));

describe("firstStrongDir", () => {
  test("follows the first strong character", () => {
    expect(dirOf("hello")).toBe("ltr");
    expect(dirOf("مرحبا hello")).toBe("rtl");
    expect(dirOf("hello مرحبا")).toBe("ltr");
    expect(dirOf("שלום")).toBe("rtl");
    expect(dirOf("你好")).toBe("ltr");
  });

  test("skips the neutral characters and empty blocks", () => {
    expect(dirOf("123, !? -- 456\n\n# \n\n> مرحبا")).toBe("rtl");
    expect(dirOf("- 1.\n- (2) Привет")).toBe("ltr");
  });

  test("is undefined without strong characters", () => {
    expect(dirOf("")).toBeUndefined();
    expect(dirOf("123 456\n\n---")).toBeUndefined();
  });
});
