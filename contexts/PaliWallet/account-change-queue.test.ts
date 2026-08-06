import { createQueuedAccountChangeHandler } from "./account-change-queue";

describe("createQueuedAccountChangeHandler", () => {
  it("runs a trailing refresh when a second notification overlaps the first", async () => {
    let releaseFirstRefresh: () => void = () => undefined;
    const firstRefresh = new Promise<void>((resolve) => {
      releaseFirstRefresh = resolve;
    });
    const refresh = jest
      .fn<Promise<void>, []>()
      .mockImplementationOnce(() => firstRefresh)
      .mockResolvedValueOnce(undefined);
    const handleAccountChange = createQueuedAccountChangeHandler(refresh);

    const firstChange = handleAccountChange();
    await Promise.resolve();
    await handleAccountChange();

    expect(refresh).toHaveBeenCalledTimes(1);

    releaseFirstRefresh();
    await firstChange;

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("runs a later non-overlapping notification normally", async () => {
    const refresh = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const handleAccountChange = createQueuedAccountChangeHandler(refresh);

    await handleAccountChange();
    await handleAccountChange();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
