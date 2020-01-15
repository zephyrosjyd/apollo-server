import { ref, Ref } from "./ref";

describe("ref", () => {
  const Pow = ref<(n: Ref<number>, e: Ref<number>) => Ref<number>>()

  it("returns a function", () => {
    expect(Pow).toBeInstanceOf(Function);
  });

  it("returns referentially stable refs", () => {
    expect(Pow(2, 3)).toBe(Pow(2, 3));
    expect(Pow(4, 2)).toBe(Pow(4, 2));
    expect(Pow(4, 2)).not.toBe(Pow(2, 3));
    expect(Pow(Pow(2, Pow(2, 3)), Pow(4, 5)))
      .toBe(Pow(Pow(2, Pow(2, 3)), Pow(4, 5)))
  });

  it("compares with shallow equality", () => {
    const ApplyOptions = ref<(options: any) => Ref<any>>()
    const options = {
      colors: true,
      emotions: 'on'
    }
    expect(ApplyOptions(options)).toBe(ApplyOptions(options))
    expect(ApplyOptions({ ...options })).not.toBe(ApplyOptions(options))
  })
});
