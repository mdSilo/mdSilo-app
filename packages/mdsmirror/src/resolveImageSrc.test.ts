import { resolveImageSrc, joinRelative } from "./lib/resolveImageSrc";

const resolveSrc = (p: string) => `asset://localhost/${p}`;
const opts = {
  rootPath: "/silo",
  docPath: "/silo/biology",
  protocol: "asset://",
  resolveSrc,
};

test("joinRelative resolves `.` and `..`", () => {
  expect(joinRelative("/silo/biology", "SNP.jpg")).toBe(
    "/silo/biology/SNP.jpg"
  );
  expect(joinRelative("/silo/biology/", "./image/a.jpg")).toBe(
    "/silo/biology/image/a.jpg"
  );
  expect(joinRelative("/silo/biology", "../a.jpg")).toBe("/silo/a.jpg");
  expect(joinRelative("C:\\silo\\bio", "..\\img\\a.jpg")).toBe(
    "C:/silo/img/a.jpg"
  );
});

test("bare relative paths are relative to the document dir", () => {
  expect(resolveImageSrc("SNP.jpg", opts)).toBe(
    resolveSrc("/silo/biology/SNP.jpg")
  );
  expect(resolveImageSrc("image/snips.jpg", opts)).toBe(
    resolveSrc("/silo/biology/image/snips.jpg")
  );
  expect(resolveImageSrc("../img/a%20b.png", opts)).toBe(
    resolveSrc("/silo/img/a b.png")
  );
});

test("`./` paths stay relative to the root", () => {
  expect(resolveImageSrc("./assets/a.png", opts)).toBe(
    resolveSrc("/silo/assets/a.png")
  );
});

test("falls back to the root without a document dir", () => {
  expect(resolveImageSrc("a.png", { ...opts, docPath: undefined })).toBe(
    resolveSrc("/silo/a.png")
  );
});

test("absolute local paths", () => {
  expect(resolveImageSrc("/home/me/a.png", opts)).toBe(
    resolveSrc("/home/me/a.png")
  );
  expect(resolveImageSrc("C:\\me\\a.png", opts)).toBe(
    resolveSrc("C:\\me\\a.png")
  );
});

test("urls are left as is", () => {
  for (const src of [
    "https://x.com/a.png",
    "data:image/png;base64,AAA",
    "blob:abc",
    "asset://localhost/a.png",
    "//x.com/a.png",
    "",
  ]) {
    expect(resolveImageSrc(src, opts)).toBe(src);
  }
});

test("without resolveSrc, only `./` is handled by protocol", () => {
  const o = { rootPath: "/silo", docPath: "/silo/bio", protocol: "asset://" };
  expect(resolveImageSrc("./a.png", o)).toBe("asset:///silo/a.png");
  expect(resolveImageSrc("a.png", o)).toBe("a.png");
});
