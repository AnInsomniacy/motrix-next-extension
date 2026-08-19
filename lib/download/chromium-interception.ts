export function holdChromiumFilenameDecision(
  work: () => Promise<void>,
  suggest: () => void,
  onError: (error: unknown) => void,
): true {
  void (async () => {
    try {
      await work();
    } catch (error) {
      onError(error);
    } finally {
      suggest();
    }
  })();

  return true;
}
